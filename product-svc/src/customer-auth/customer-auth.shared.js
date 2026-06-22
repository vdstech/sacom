import jwt from "jsonwebtoken";

export function getCustomerAccessTokenSecret() {
  return process.env.CUSTOMER_ACCESS_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET || "";
}

export function verifyCustomerAccessToken(token) {
  const secret = getCustomerAccessTokenSecret();
  if (!secret) return null;
  return jwt.verify(token, secret);
}
