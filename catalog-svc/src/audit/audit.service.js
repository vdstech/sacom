import mongoose from "mongoose";
import AuditLog from "./audit-log.model.js";
import { getRequestContext } from "../../../shared/request-context.js";
import { sanitizeAuditValue } from "../../../shared/audit-utils.js";

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function toObjectId(value) {
  return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

function uniqueStrings(values = []) {
  return Array.from(new Set((values || []).map((value) => normalizeString(value)).filter(Boolean)));
}

function buildActorSnapshot(actor = {}, req = null) {
  const requestUser = req?.user || null;
  return {
    actorType: normalizeString(actor.actorType || (requestUser ? "USER" : "SYSTEM")).toUpperCase(),
    userId: toObjectId(actor.userId || requestUser?._id),
    email: normalizeString(actor.email || requestUser?.email),
    name: normalizeString(actor.name || requestUser?.name),
    role: normalizeString(actor.role || requestUser?.primaryRole || "ADMIN_USER"),
    roleNames: uniqueStrings(actor.roleNames || requestUser?.roleNames || []),
  };
}

function buildRequestSnapshot(req = null) {
  const context = getRequestContext();
  const source = req || context?.req || null;
  return {
    requestId: normalizeString(context?.requestId || source?.id || source?.headers?.["x-request-id"]),
    method: normalizeString(context?.method || source?.method).toUpperCase(),
    path: normalizeString(context?.path || source?.originalUrl || source?.url),
    ipAddress: normalizeString(context?.ipAddress || source?.ip || source?.headers?.["x-forwarded-for"]),
    userAgent: normalizeString(context?.userAgent || source?.headers?.["user-agent"]),
  };
}

export async function recordAuditEvent({
  service = "catalog-svc",
  req = null,
  actor = {},
  action,
  entityType,
  entityId = "",
  entityDisplayId = "",
  before = undefined,
  after = undefined,
  result = "SUCCESS",
  failureReason = "",
  metadata = {},
}) {
  const normalizedAction = normalizeString(action).toUpperCase();
  const normalizedEntityType = normalizeString(entityType).toUpperCase();
  if (!normalizedAction || !normalizedEntityType) return null;

  const currentReq = req || getRequestContext()?.req || null;
  try {
    return await AuditLog.create({
      service: normalizeString(service, "catalog-svc"),
      action: normalizedAction,
      entityType: normalizedEntityType,
      entityId: normalizeString(entityId),
      entityDisplayId: normalizeString(entityDisplayId),
      actor: buildActorSnapshot(actor, currentReq),
      request: buildRequestSnapshot(currentReq),
      result: normalizeString(result, "SUCCESS").toUpperCase() === "FAILURE" ? "FAILURE" : "SUCCESS",
      failureReason: normalizeString(failureReason),
      changes: {
        before: sanitizeAuditValue(before) ?? null,
        after: sanitizeAuditValue(after) ?? null,
      },
      metadata: sanitizeAuditValue(metadata) || {},
    });
  } catch {
    return null;
  }
}
