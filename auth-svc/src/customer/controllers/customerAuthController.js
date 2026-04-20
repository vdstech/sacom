import Customer from "../models/customerModel.js";
import CustomerSession from "../models/customerSessionModel.js";
import { hashPassword, verify } from "../../security/password.js";
import {
  buildCustomerAccessToken,
  clearCustomerRefreshCookie,
  customerSessionExpiryDate,
  getCustomerAccessTokenSecret,
  getCustomerRefreshToken,
  makeRefreshToken,
  setCustomerRefreshCookie,
  sha256Hex,
} from "../auth.shared.js";

function toCustomerPayload(customer) {
  return {
    id: customer._id,
    email: customer.email,
    name: customer.name,
    phone: customer.phone || "",
  };
}

export async function signup(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }

    const existing = await Customer.findOne({ email }).select("_id").lean();
    if (existing) return res.status(409).json({ error: "Customer already exists" });

    const passwordHash = await hashPassword(password);
    const customer = await Customer.create({
      name,
      email,
      phone,
      passwordHash,
    });

    const refreshToken = makeRefreshToken();
    const session = await CustomerSession.create({
      customer: customer._id,
      refreshTokenHash: sha256Hex(refreshToken),
      expiresAt: customerSessionExpiryDate(),
      userAgent: req.headers["user-agent"] || "",
      ip: req.ip,
      lastSeenAt: new Date(),
    });

    if (!getCustomerAccessTokenSecret()) {
      return res.status(500).json({ error: "Server misconfigured" });
    }

    const accessToken = buildCustomerAccessToken({
      sub: customer._id.toString(),
      customerSessionId: session._id.toString(),
      customer: true,
    });

    setCustomerRefreshCookie(res, refreshToken);
    return res.status(201).json({ customer: toCustomerPayload(customer), accessToken });
  } catch (error) {
    return res.status(500).json({ error: "Unable to create customer account" });
  }
}

export async function login(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const customer = await Customer.findOne({ email })
      .select("_id email name phone passwordHash disabled")
      .lean();
    if (!customer) return res.status(401).json({ error: "email / password is incorrect" });
    if (customer.disabled) return res.status(403).json({ error: "Customer account is disabled" });

    const passwordMatch = await verify(password, customer.passwordHash);
    if (!passwordMatch) return res.status(401).json({ error: "email / password is incorrect" });

    const refreshToken = makeRefreshToken();
    const session = await CustomerSession.create({
      customer: customer._id,
      refreshTokenHash: sha256Hex(refreshToken),
      expiresAt: customerSessionExpiryDate(),
      userAgent: req.headers["user-agent"] || "",
      ip: req.ip,
      lastSeenAt: new Date(),
    });

    if (!getCustomerAccessTokenSecret()) {
      return res.status(500).json({ error: "Server misconfigured" });
    }

    const accessToken = buildCustomerAccessToken({
      sub: customer._id.toString(),
      customerSessionId: session._id.toString(),
      customer: true,
    });

    setCustomerRefreshCookie(res, refreshToken);
    return res.json({ customer: toCustomerPayload(customer), accessToken });
  } catch {
    return res.status(500).json({ error: "Unable to login" });
  }
}

export async function refresh(req, res) {
  try {
    const refreshToken = getCustomerRefreshToken(req);
    if (!refreshToken) return res.status(401).json({ error: "Unauthorized" });

    const session = await CustomerSession.findOne({ refreshTokenHash: sha256Hex(refreshToken) })
      .select("_id customer expiresAt")
      .lean();
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      await CustomerSession.deleteOne({ _id: session._id });
      clearCustomerRefreshCookie(res);
      return res.status(401).json({ error: "Session expired" });
    }

    const customer = await Customer.findById(session.customer)
      .select("_id email name phone disabled")
      .lean();
    if (!customer || customer.disabled) {
      await CustomerSession.deleteOne({ _id: session._id });
      clearCustomerRefreshCookie(res);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accessToken = buildCustomerAccessToken({
      sub: customer._id.toString(),
      customerSessionId: session._id.toString(),
      customer: true,
    });

    await CustomerSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } });
    return res.json({ customer: toCustomerPayload(customer), accessToken });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export async function logout(req, res) {
  try {
    const refreshToken = getCustomerRefreshToken(req);
    if (refreshToken) {
      await CustomerSession.deleteOne({ refreshTokenHash: sha256Hex(refreshToken) });
    }
  } finally {
    clearCustomerRefreshCookie(res);
    return res.json({ message: "Logged out" });
  }
}
