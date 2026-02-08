import fs from "fs";

export function validateRequiredEnv(service, logger, keys = []) {
  const missing = keys.filter((k) => !String(process.env[k] || "").trim());
  if (missing.length > 0) {
    logger.error({ missing }, `${service} missing required environment variables`);
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  for (const fileKey of ["TLS_CERT_PATH", "TLS_KEY_PATH"]) {
    const p = String(process.env[fileKey] || "").trim();
    if (!fs.existsSync(p)) {
      logger.error({ key: fileKey, path: p }, `${service} TLS file not found`);
      throw new Error(`TLS file not found for ${fileKey}: ${p}`);
    }
  }
}
