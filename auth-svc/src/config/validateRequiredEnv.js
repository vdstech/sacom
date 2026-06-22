import fs from "fs";

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validateOptionalNumberEnv({ key, min = 0, max = Infinity, integer = false }, logger, service) {
  const raw = String(process.env[key] || "").trim();
  if (!raw) return;
  const numeric = asNumber(raw);
  const valid = numeric !== null
    && numeric >= min
    && numeric <= max
    && (!integer || Number.isInteger(numeric));

  if (valid) return;

  logger.error({ key, value: raw }, `${service} invalid environment variable`);
  throw new Error(`Invalid environment variable ${key}: ${raw}`);
}

export function validateRequiredEnv(service, logger, keys = []) {
  const missing = keys.filter((k) => !String(process.env[k] || "").trim());
  if (missing.length > 0) {
    logger.error({ missing }, `${service} missing required environment variables`);
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  validateOptionalNumberEnv({ key: "DEFAULT_PRODUCT_TAX_RATE", min: 0, max: 0.9999 }, logger, service);
  validateOptionalNumberEnv({ key: "STANDARD_SHIPPING_CHARGE", min: 0 }, logger, service);
  validateOptionalNumberEnv({ key: "FREE_SHIPPING_CART_VALUE", min: 0 }, logger, service);
  validateOptionalNumberEnv({ key: "PRICING_RULE_VERSION", min: 1, integer: true }, logger, service);
  validateOptionalNumberEnv({ key: "AUDIT_LOG_RETENTION_DAYS", min: 1, integer: true }, logger, service);
  validateOptionalNumberEnv({ key: "AUDIT_LOG_CLEANUP_INTERVAL_MS", min: 60000, integer: true }, logger, service);

  const enableTls = String(process.env.ENABLE_TLS || "false").toLowerCase() === "true";
  if (!enableTls) return;

  for (const fileKey of ["TLS_CERT_PATH", "TLS_KEY_PATH"]) {
    const p = String(process.env[fileKey] || "").trim();
    if (!fs.existsSync(p)) {
      logger.error({ key: fileKey, path: p }, `${service} TLS file not found`);
      throw new Error(`TLS file not found for ${fileKey}: ${p}`);
    }
  }
}
