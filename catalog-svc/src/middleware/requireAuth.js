import jwt from "jsonwebtoken";
import Session from "../models/sessionModel.js";

export async function requireAuth(req, res, next) {
  try {
    // 1) Get token from Authorization header
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!process.env.ACCESS_TOKEN_SECRET) {
      return res.status(500).json({ error: "Server misconfigured" });
    }

    // 2) Verify JWT
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const sessionId = decoded?.sessionId;
    const userId = decoded?.sub;

    if (!sessionId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 3) Load session (and ensure it belongs to the token's user)
    const session = await Session.findOne({ _id: sessionId, user: userId })
      .select("user effectivePermissions expiresAt lastSeenAt")
      .lean();

    if (!session) {
      return res.status(401).json({ error: "Session not found" });
    }

    // Optional guard (TTL will clean up, but still protect)
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }

    // 4) Attach auth context
    req.auth = {
      userId,
      sessionId,
      systemUser: !!decoded?.systemUser,
      systemLevel: decoded?.systemLevel || "NONE",
    };

    req.user = { _id: session.user };
    req.effectivePermissions = new Set(session.effectivePermissions || []);

    // 5) Touch lastSeenAt at most once per minute (avoid DB write per request)
    if (!session.lastSeenAt || Date.now() - new Date(session.lastSeenAt).getTime() > 60_000) {
      Session.updateOne({ _id: sessionId }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
    }

    return next();
  } catch (e) {
    // Includes token expiry, invalid signature, etc.
    return res.status(401).json({ error: "Unauthorized" });
  }
}
