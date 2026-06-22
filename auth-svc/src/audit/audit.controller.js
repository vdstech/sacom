import { listAuditLogs } from "./audit.service.js";

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export async function getAuditLogs(req, res) {
  try {
    const payload = await listAuditLogs({
      page: normalizePositiveInteger(req.query?.page, 1),
      limit: normalizePositiveInteger(req.query?.limit, 25),
      action: req.query?.action,
      actor: req.query?.actor,
      entityType: req.query?.entityType,
      entityId: req.query?.entityId,
      result: req.query?.result,
      from: req.query?.from,
      to: req.query?.to,
    });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load audit logs" });
  }
}
