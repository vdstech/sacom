import mongoose from "mongoose";
import AuditLog from "./audit-log.model.js";
import { getRequestContext } from "../../../shared/request-context.js";
import {
  normalizeRetentionDays,
  resolveConfiguredRetentionDays,
  sanitizeAuditValue,
  subtractRetentionWindow,
} from "../../../shared/audit-utils.js";

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
  const requestCustomer = req?.customer || null;

  const actorType = normalizeString(
    actor.actorType
      || (requestCustomer ? "CUSTOMER" : "")
      || (requestUser ? "USER" : "")
      || "SYSTEM"
  ).toUpperCase();

  return {
    actorType,
    userId: toObjectId(actor.userId || requestUser?._id || requestCustomer?._id),
    email: normalizeString(actor.email || requestUser?.email || requestCustomer?.email),
    name: normalizeString(actor.name || requestUser?.name || requestCustomer?.name),
    role: normalizeString(actor.role || requestUser?.primaryRole || (requestCustomer ? "CUSTOMER" : actorType)),
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

function buildChanges(before, after) {
  const sanitizedBefore = sanitizeAuditValue(before);
  const sanitizedAfter = sanitizeAuditValue(after);
  return {
    before: sanitizedBefore === undefined ? null : sanitizedBefore,
    after: sanitizedAfter === undefined ? null : sanitizedAfter,
  };
}

export async function recordAuditEvent({
  service = "auth-svc",
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
      service: normalizeString(service, "auth-svc"),
      action: normalizedAction,
      entityType: normalizedEntityType,
      entityId: normalizeString(entityId),
      entityDisplayId: normalizeString(entityDisplayId),
      actor: buildActorSnapshot(actor, currentReq),
      request: buildRequestSnapshot(currentReq),
      result: normalizeString(result, "SUCCESS").toUpperCase() === "FAILURE" ? "FAILURE" : "SUCCESS",
      failureReason: normalizeString(failureReason),
      changes: buildChanges(before, after),
      metadata: sanitizeAuditValue(metadata) || {},
    });
  } catch {
    return null;
  }
}

export async function listAuditLogs({
  page = 1,
  limit = 25,
  action = "",
  entityType = "",
  entityId = "",
  actor = "",
  result = "",
  from = "",
  to = "",
}) {
  const normalizedPage = Math.max(1, Math.floor(Number(page) || 1));
  const normalizedLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
  const query = {};

  if (normalizeString(action)) query.action = normalizeString(action).toUpperCase();
  if (normalizeString(entityType)) query.entityType = normalizeString(entityType).toUpperCase();
  if (normalizeString(entityId)) query.entityId = normalizeString(entityId);
  if (normalizeString(result)) query.result = normalizeString(result).toUpperCase();

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate && !Number.isNaN(fromDate.getTime())) query.createdAt.$gte = fromDate;
    if (toDate && !Number.isNaN(toDate.getTime())) query.createdAt.$lte = toDate;
    if (!Object.keys(query.createdAt).length) delete query.createdAt;
  }

  const actorSearch = normalizeString(actor);
  if (actorSearch) {
    const regex = new RegExp(actorSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const actorMatch = [];
    if (mongoose.isValidObjectId(actorSearch)) {
      actorMatch.push({ "actor.userId": new mongoose.Types.ObjectId(actorSearch) });
    }
    actorMatch.push(
      { "actor.email": regex },
      { "actor.name": regex },
      { "actor.role": regex },
      { "actor.roleNames": regex }
    );
    query.$or = actorMatch;
  }

  const total = await AuditLog.countDocuments(query);
  const items = await AuditLog.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .skip((normalizedPage - 1) * normalizedLimit)
    .limit(normalizedLimit)
    .lean();

  return {
    items: items.map((item) => ({
      id: String(item._id),
      timestamp: item.createdAt || null,
      service: normalizeString(item.service),
      action: normalizeString(item.action),
      entityType: normalizeString(item.entityType),
      entityId: normalizeString(item.entityId),
      entityDisplayId: normalizeString(item.entityDisplayId),
      actor: {
        actorType: normalizeString(item.actor?.actorType),
        userId: item.actor?.userId ? String(item.actor.userId) : "",
        email: normalizeString(item.actor?.email),
        name: normalizeString(item.actor?.name),
        role: normalizeString(item.actor?.role),
        roleNames: uniqueStrings(item.actor?.roleNames || []),
      },
      request: {
        requestId: normalizeString(item.request?.requestId),
        method: normalizeString(item.request?.method),
        path: normalizeString(item.request?.path),
        ipAddress: normalizeString(item.request?.ipAddress),
        userAgent: normalizeString(item.request?.userAgent),
      },
      result: normalizeString(item.result),
      failureReason: normalizeString(item.failureReason),
      changes: {
        before: item.changes?.before ?? null,
        after: item.changes?.after ?? null,
      },
      metadata: item.metadata || {},
    })),
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages: Math.max(1, Math.ceil(total / normalizedLimit)),
  };
}

export async function purgeExpiredAuditLogs({
  now = new Date(),
  retentionDays = process.env.AUDIT_LOG_RETENTION_DAYS,
} = {}) {
  const configuredRetentionDays = resolveConfiguredRetentionDays(retentionDays);
  if (configuredRetentionDays === null) {
    return {
      retentionDays: null,
      cutoff: null,
      deletedCount: 0,
      enabled: false,
    };
  }
  const normalizedRetentionDays = normalizeRetentionDays(configuredRetentionDays);
  const cutoff = subtractRetentionWindow(now, normalizedRetentionDays);
  const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  return {
    retentionDays: normalizedRetentionDays,
    cutoff,
    deletedCount: Number(result?.deletedCount || 0),
    enabled: true,
  };
}
