import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

const requestContextStorage = new AsyncLocalStorage();

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export function buildRequestContext(req) {
  return {
    requestId: normalizeHeaderValue(req?.id || req?.headers?.["x-request-id"]) || crypto.randomUUID(),
    method: normalizeHeaderValue(req?.method).toUpperCase(),
    path: normalizeHeaderValue(req?.originalUrl || req?.url),
    ipAddress: normalizeHeaderValue(req?.ip || req?.headers?.["x-forwarded-for"]),
    userAgent: normalizeHeaderValue(req?.headers?.["user-agent"]),
    req,
  };
}

export function requestContextMiddleware(req, _res, next) {
  const context = buildRequestContext(req);
  requestContextStorage.run(context, () => next());
}

export function getRequestContext() {
  return requestContextStorage.getStore() || null;
}
