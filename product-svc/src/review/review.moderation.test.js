import test from "node:test";
import assert from "node:assert/strict";
import {
  assertReviewModerationConfiguration,
  moderateReviewContent,
} from "./review.moderation.js";

function createResponse({ status = 200, payload = {}, retryAfter = "" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "retry-after" ? retryAfter : null },
    json: async () => payload,
  };
}

function config(overrides = {}) {
  return {
    provider: "openai",
    apiKey: "test-key",
    model: "omni-moderation-latest",
    timeoutMs: 50,
    maxReviewsPerWindow: 5,
    rateWindowMs: 600000,
    ...overrides,
  };
}

test("moderation auto-approves a clean OpenAI result and keeps decision metadata", async () => {
  const result = await moderateReviewContent(
    { title: "Beautiful fabric", comment: "The color and finish are excellent." },
    {
      config: config(),
      fetchImpl: async () => createResponse({
        payload: {
          id: "modr-clean",
          results: [{ flagged: false, categories: { harassment: false }, category_scores: { harassment: 0.002 } }],
        },
      }),
    }
  );

  assert.equal(result.status, "APPROVED");
  assert.equal(result.automatedModeration.provider, "OPENAI");
  assert.equal(result.automatedModeration.requestId, "modr-clean");
  assert.equal(result.automatedModeration.scores.harassment, 0.002);
});

test("moderation keeps flagged OpenAI results pending with categories and scores", async () => {
  const result = await moderateReviewContent(
    { title: "Bad", comment: "This is unacceptable." },
    {
      config: config(),
      fetchImpl: async () => createResponse({
        payload: {
          id: "modr-flagged",
          results: [{ flagged: true, categories: { harassment: true, violence: false }, category_scores: { harassment: 0.87, violence: 0.01 } }],
        },
      }),
    }
  );

  assert.equal(result.status, "PENDING");
  assert.equal(result.moderationReason, "AUTOMATED_MODERATION_FLAGGED");
  assert.deepEqual(result.automatedModeration.categories, ["harassment"]);
  assert.equal(result.automatedModeration.scores.harassment, 0.87);
});

test("moderation retries one rate-limited request and honors retry-after", async () => {
  let calls = 0;
  const delays = [];
  const result = await moderateReviewContent(
    { title: "Lovely", comment: "The material is very nice." },
    {
      config: config(),
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? createResponse({ status: 429, retryAfter: "1" })
          : createResponse({ payload: { id: "modr-retry", results: [{ flagged: false, categories: {}, category_scores: {} }] } });
      },
      sleep: async (ms) => { delays.push(ms); },
    }
  );

  assert.equal(calls, 2);
  assert.equal(delays[0], 1000);
  assert.equal(result.status, "APPROVED");
});

test("moderation keeps exhausted provider errors and invalid responses pending", async () => {
  let calls = 0;
  const providerError = await moderateReviewContent(
    { title: "Review", comment: "The fabric feels good." },
    {
      config: config(),
      fetchImpl: async () => {
        calls += 1;
        return createResponse({ status: 503 });
      },
      sleep: async () => {},
    }
  );
  assert.equal(calls, 2);
  assert.equal(providerError.status, "PENDING");
  assert.equal(providerError.moderationReason, "MODERATION_PROVIDER_ERROR");

  const invalid = await moderateReviewContent(
    { title: "Review", comment: "The fabric feels good." },
    {
      config: config(),
      fetchImpl: async () => createResponse({ payload: { id: "modr-invalid", results: [] } }),
    }
  );
  assert.equal(invalid.status, "PENDING");
  assert.equal(invalid.moderationReason, "MODERATION_INVALID_RESPONSE");
});

test("moderation keeps network and timeout failures pending", async () => {
  const timeout = await moderateReviewContent(
    { title: "Review", comment: "The fabric feels good." },
    {
      config: config(),
      fetchImpl: async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      },
    }
  );
  assert.equal(timeout.status, "PENDING");
  assert.equal(timeout.moderationReason, "MODERATION_TIMEOUT");
});

test("OpenAI configuration requires a server-only API key", () => {
  assert.throws(
    () => assertReviewModerationConfiguration({ REVIEW_MODERATION_PROVIDER: "openai" }),
    /OPENAI_API_KEY/
  );
  assert.equal(
    assertReviewModerationConfiguration({ REVIEW_MODERATION_PROVIDER: "openai", OPENAI_API_KEY: "key" }).provider,
    "openai"
  );
});
