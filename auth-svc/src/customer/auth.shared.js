import jwt from "jsonwebtoken";
import crypto from "crypto";

export const CUSTOMER_REFRESH_COOKIE_NAME = "customerRefreshToken";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function makeRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function getCustomerAccessTokenSecret() {
  return process.env.CUSTOMER_ACCESS_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET || "";
}

export function buildCustomerAccessToken(payload) {
  const secret = getCustomerAccessTokenSecret();
  return jwt.sign(payload, secret, {
    expiresIn: process.env.CUSTOMER_ACCESS_TOKEN_TTL || process.env.ACCESS_TOKEN_TTL || "15m",
  });
}

export function setCustomerRefreshCookie(res, refreshToken) {
  res.cookie(CUSTOMER_REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: THIRTY_DAYS_MS,
    path: "/",
  });
}

export function clearCustomerRefreshCookie(res) {
  res.clearCookie(CUSTOMER_REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part) continue;
    const [key, ...rest] = part.split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function getCustomerRefreshToken(req) {
  return readCookie(req, CUSTOMER_REFRESH_COOKIE_NAME);
}

export function customerSessionExpiryDate() {
  return new Date(Date.now() + THIRTY_DAYS_MS);
}
