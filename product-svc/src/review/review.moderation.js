const OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_RATE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_REVIEWS_PER_WINDOW = 5;

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeProvider(value) {
  return normalizeString(value, "openai").toLowerCase() || "openai";
}

function parseRetryAfter(value) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(String(value || ""));
  return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeModerationText(value) {
  return normalizeString(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function structuralSpamSignals(text) {
  const signals = [];
  const links = text.match(/(?:https?:\/\/|www\.)\S+/gi) || [];
  if (links.length >= 2) signals.push("multiple_links");
  if (/(.)\1{7,}/u.test(text)) signals.push("excessive_repeated_characters");
  return signals;
}

function pendingModeration({
  reason,
  note,
  provider = "",
  model = "",
  categories = [],
  scores = {},
  requestId = "",
  failureReason = "",
  signals = [],
} = {}) {
  return {
    status: "PENDING",
    moderationReason: reason,
    moderationNote: note,
    moderationSource: "AUTO",
    moderationSignals: signals,
    automatedModeration: {
      provider,
      model,
      decision: "PENDING",
      reason,
      categories,
      scores,
      checkedAt: new Date(),
      requestId,
      failureReason,
    },
  };
}

function approvedModeration({ provider, model, requestId, categories, scores }) {
  return {
    status: "APPROVED",
    moderationReason: "AUTOMATED_MODERATION_PASSED",
    moderationNote: "Auto-approved after automated moderation.",
    moderationSource: "AUTO",
    moderationSignals: [],
    automatedModeration: {
      provider,
      model,
      decision: "APPROVED",
      reason: "AUTOMATED_MODERATION_PASSED",
      categories,
      scores,
      checkedAt: new Date(),
      requestId,
      failureReason: "",
    },
  };
}

function extractOpenAiResult(payload) {
  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!result || typeof result.flagged !== "boolean") return null;

  const categories = Object.entries(result.categories || {})
    .filter(([, flagged]) => flagged === true)
    .map(([category]) => category);
  const scores = Object.fromEntries(
    Object.entries(result.category_scores || {})
      .filter(([, score]) => Number.isFinite(Number(score)))
      .map(([category, score]) => [category, Number(score)])
  );

  return { flagged: result.flagged, categories, scores };
}

export function getReviewModerationConfig(env = process.env) {
  return {
    provider: normalizeProvider(env.REVIEW_MODERATION_PROVIDER),
    apiKey: normalizeString(env.OPENAI_API_KEY),
    model: normalizeString(env.REVIEW_MODERATION_MODEL, "omni-moderation-latest") || "omni-moderation-latest",
    timeoutMs: normalizePositiveInteger(env.REVIEW_MODERATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxReviewsPerWindow: normalizePositiveInteger(env.REVIEW_MODERATION_MAX_REVIEWS_PER_WINDOW, DEFAULT_MAX_REVIEWS_PER_WINDOW),
    rateWindowMs: normalizePositiveInteger(env.REVIEW_MODERATION_RATE_WINDOW_MS, DEFAULT_RATE_WINDOW_MS),
  };
}

export function assertReviewModerationConfiguration(env = process.env) {
  const config = getReviewModerationConfig(env);
  if (config.provider !== "openai") {
    throw new Error(`Unsupported REVIEW_MODERATION_PROVIDER: ${config.provider}`);
  }
  if (!config.apiKey) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY");
  }
  return config;
}

export async function checkReviewRateLimit({ customerId, ReviewModel, config = getReviewModerationConfig(), now = new Date() } = {}) {
  if (!ReviewModel?.countDocuments || !customerId) return { limited: false, count: 0 };
  const since = new Date(now.getTime() - config.rateWindowMs);
  const count = await ReviewModel.countDocuments({ customerId, createdAt: { $gte: since } });
  return { limited: count >= config.maxReviewsPerWindow, count };
}

export async function moderateReviewContent(
  { title = "", comment = "" } = {},
  {
    config = getReviewModerationConfig(),
    fetchImpl = globalThis.fetch,
    sleep = delay,
  } = {}
) {
  const input = normalizeModerationText(`${title}\n${comment}`);
  const spamSignals = structuralSpamSignals(input);
  if (spamSignals.length) {
    return pendingModeration({
      reason: "STRUCTURAL_SPAM_SIGNAL",
      note: "Sent to manual review because structural spam signals were detected.",
      provider: "LOCAL",
      signals: spamSignals,
    });
  }

  if (config.provider !== "openai" || !config.apiKey || typeof fetchImpl !== "function") {
    return pendingModeration({
      reason: "MODERATION_UNAVAILABLE",
      note: "Sent to manual review because automated moderation is unavailable.",
      provider: config.provider.toUpperCase(),
      model: config.model,
      failureReason: "PROVIDER_NOT_CONFIGURED",
    });
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(OPENAI_MODERATIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ model: config.model, input }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt === 0) {
          await sleep(Math.max(DEFAULT_RETRY_DELAY_MS, parseRetryAfter(response.headers?.get?.("retry-after"))));
          continue;
        }
        const reason = response.status === 429 ? "MODERATION_RATE_LIMITED" : "MODERATION_PROVIDER_ERROR";
        return pendingModeration({
          reason,
          note: "Sent to manual review because automated moderation did not complete.",
          provider: "OPENAI",
          model: config.model,
          failureReason: `HTTP_${response.status}`,
        });
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        return pendingModeration({
          reason: "MODERATION_INVALID_RESPONSE",
          note: "Sent to manual review because automated moderation returned an invalid response.",
          provider: "OPENAI",
          model: config.model,
          failureReason: "INVALID_JSON",
        });
      }

      const result = extractOpenAiResult(payload);
      if (!result) {
        return pendingModeration({
          reason: "MODERATION_INVALID_RESPONSE",
          note: "Sent to manual review because automated moderation returned an incomplete response.",
          provider: "OPENAI",
          model: config.model,
          requestId: normalizeString(payload?.id),
          failureReason: "MISSING_RESULT",
        });
      }

      if (result.flagged) {
        return pendingModeration({
          reason: "AUTOMATED_MODERATION_FLAGGED",
          note: "Sent to manual review because automated moderation flagged the review.",
          provider: "OPENAI",
          model: config.model,
          categories: result.categories,
          scores: result.scores,
          requestId: normalizeString(payload?.id),
          signals: result.categories,
        });
      }

      return approvedModeration({
        provider: "OPENAI",
        model: config.model,
        requestId: normalizeString(payload?.id),
        categories: result.categories,
        scores: result.scores,
      });
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      return pendingModeration({
        reason: timedOut ? "MODERATION_TIMEOUT" : "MODERATION_UNAVAILABLE",
        note: "Sent to manual review because automated moderation did not complete.",
        provider: "OPENAI",
        model: config.model,
        failureReason: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return pendingModeration({
    reason: "MODERATION_UNAVAILABLE",
    note: "Sent to manual review because automated moderation did not complete.",
    provider: "OPENAI",
    model: config.model,
    failureReason: "RETRY_EXHAUSTED",
  });
}
