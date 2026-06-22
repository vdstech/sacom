export const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 180;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /api[-_]?key/i,
  /card/i,
  /cvv/i,
  /otp/i,
];

function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(String(key || "")));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

export function sanitizeAuditValue(value, depth = 0) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAuditValue(entry, depth + 1));
  }
  if (isPlainObject(value)) {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = isSensitiveKey(key) ? REDACTED : sanitizeAuditValue(entry, depth + 1);
    }
    return next;
  }
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}...[TRUNCATED]` : value;
  return value;
}

export function normalizeRetentionDays(value, fallback = DEFAULT_AUDIT_LOG_RETENTION_DAYS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export function resolveConfiguredRetentionDays(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.floor(parsed));
}

export function subtractRetentionWindow(now, retentionDays) {
  return new Date(now.getTime() - (retentionDays * 24 * 60 * 60 * 1000));
}
