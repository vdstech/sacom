import jwt from "jsonwebtoken";
import crypto from "crypto";

import User from "../models/userModel.js";
import Role from "../models/roleModel.js";
import Session from "../models/sessionModel.js";

import { verify } from "../../security/password.js";
import { computeEffectivePermissionsForUser } from "../services/permissionService.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = "refreshToken";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeRefreshToken() {
  // 256-bit token
  return crypto.randomBytes(32).toString("hex");
}

function buildAccessToken(payload) {
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_TTL || "15m",
  });
}

function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: THIRTY_DAYS_MS,
    path: "/",
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    // Fetch only what we need for login (no deep populate)
    const user = await User.findOne({ email }).select(
      "_id email passwordHash roles disabled force_reset isSystemUser systemLevel"
    );

    if (!user) {
      return res.status(401).json({ error: "email / password is incorrect" });
    }

    if (user.disabled) {
      return res.status(403).json({ error: "User is disabled" });
    }

    const passwordMatch = await verify(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "email / password is incorrect" });
    }

    // If you want to force password reset flows, block here
    if (user.force_reset) {
      return res.status(403).json({ error: "Password reset required", code: "FORCE_RESET" });
    }

    if (!process.env.ACCESS_TOKEN_SECRET) {
      return res.status(500).json({ error: "Server misconfigured (ACCESS_TOKEN_SECRET missing)" });
    }

    // Compute effective permission codes ONCE (login time)
    const permsSet = await computeEffectivePermissionsForUser(user);

    // Create refresh token + store only a hash in DB
    const refreshToken = makeRefreshToken();
    const refreshTokenHash = sha256Hex(refreshToken);

    const session = await Session.create({
      user: user._id,
      refreshTokenHash,
      effectivePermissions: Array.from(permsSet),
      expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      userAgent: req.headers["user-agent"] || "",
      ip: req.ip,
      lastSeenAt: new Date(),
    });

    console.log('############ User logged in:', user)
    const payload = {
      sub: user._id.toString(),
      systemUser: !!user.isSystemUser,
      systemLevel: user.systemLevel || "NONE",
      sessionId: session._id.toString(),
    };

    console.log('############ Login payload', payload);

    const accessToken = buildAccessToken(payload);

    // Recommended: put refresh token in httpOnly cookie for scalability & security
    setRefreshCookie(res, refreshToken);

    // Return role names (small extra query, only on login)
    const roleDocs = await Role.find({ _id: { $in: user.roles || [] } })
      .select("_id name")
      .lean();

    return res.json({
      user: {
        id: user._id,
        email: user.email,
        roles: roleDocs,
      },
      accessToken,
    });
  } catch (e) {
    console.error("login failed", e);
    return res.status(500).json({ error: "Something went wrong. Try again later." });
  }
};

export const refresh = async (req, res) => {
  try {
    if (!process.env.ACCESS_TOKEN_SECRET) {
      return res.status(500).json({ error: "Server misconfigured (ACCESS_TOKEN_SECRET missing)" });
    }

    const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
    if (!refreshToken) return res.status(401).json({ error: "Unauthorized" });

    const refreshTokenHash = sha256Hex(refreshToken);
    const session = await Session.findOne({ refreshTokenHash })
      .select("_id user expiresAt effectivePermissions")
      .lean();

    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      await Session.deleteOne({ _id: session._id });
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Session expired" });
    }

    const user = await User.findById(session.user).select("_id email systemLevel isSystemUser disabled");
    if (!user || user.disabled) {
      await Session.deleteOne({ _id: session._id });
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = {
      sub: user._id.toString(),
      systemUser: !!user.isSystemUser,
      systemLevel: user.systemLevel || "NONE",
      sessionId: session._id.toString(),
    };

    const accessToken = buildAccessToken(payload);
    await Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } });

    return res.json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
      },
      permissions: session.effectivePermissions || [],
    });
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
    if (refreshToken) {
      const refreshTokenHash = sha256Hex(refreshToken);
      await Session.deleteOne({ refreshTokenHash });
    }

    clearRefreshCookie(res);
    return res.json({ message: "Logged out" });
  } catch (e) {
    clearRefreshCookie(res);
    return res.json({ message: "Logged out" });
  }
};
