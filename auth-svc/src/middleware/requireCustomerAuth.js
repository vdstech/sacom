import jwt from "jsonwebtoken";
import CustomerSession from "../customer/models/customerSessionModel.js";
import Customer from "../customer/models/customerModel.js";
import { getCustomerAccessTokenSecret } from "../customer/auth.shared.js";

function misconfigured(res) {
  const payload = { error: "Server misconfigured" };
  return res.status(500).json(payload);
}

export async function requireCustomerAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const secret = getCustomerAccessTokenSecret();
    if (!secret) return misconfigured(res);

    const decoded = jwt.verify(token, secret);
    const customerId = decoded?.sub;
    const sessionId = decoded?.customerSessionId;
    if (!customerId || !sessionId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Customer API routes trust the access token only after confirming the backing
    // refresh-session still exists and has not expired in MongoDB.
    const session = await CustomerSession.findOne({ _id: sessionId, customer: customerId })
      .select("customer expiresAt lastSeenAt")
      .lean();
    if (!session) return res.status(401).json({ error: "Session not found" });
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }

    const customer = await Customer.findById(session.customer)
      .select("_id email name phone disabled")
      .lean();
    if (!customer || customer.disabled) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.customerAuth = {
      customerId: String(customerId),
      sessionId: String(sessionId),
    };
    req.customer = customer;

    if (!session.lastSeenAt || Date.now() - new Date(session.lastSeenAt).getTime() > 60_000) {
      CustomerSession.updateOne({ _id: sessionId }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
    }

    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
