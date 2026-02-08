import jwt from "jsonwebtoken";
import Session from "../models/sessionModel.js";

function misconfigured(res) {
  const isDev = process.env.NODE_ENV !== "production";
  const payload = { error: "Server misconfigured" };
  if (isDev) payload.code = "CONFIG_ACCESS_TOKEN_SECRET_MISSING";
  return res.status(500).json(payload);
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!process.env.ACCESS_TOKEN_SECRET) {
      return misconfigured(res);
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const sessionId = decoded?.sessionId;
    const userId = decoded?.sub;

    if (!sessionId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const session = await Session.findOne({ _id: sessionId, user: userId })
      .select("user effectivePermissions expiresAt lastSeenAt")
      .lean();
    if (!session) return res.status(401).json({ error: "Session not found" });
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }

    req.auth = {
      userId,
      sessionId,
      systemUser: !!decoded?.systemUser,
      systemLevel: decoded?.systemLevel || "NONE",
    };
    req.user = { _id: session.user };
    req.effectivePermissions = new Set(session.effectivePermissions || []);

    if (!session.lastSeenAt || Date.now() - new Date(session.lastSeenAt).getTime() > 60_000) {
      Session.updateOne({ _id: sessionId }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
    }

    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
