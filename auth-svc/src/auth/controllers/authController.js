import jwt from "jsonwebtoken";
import crypto from "crypto";

import User from "../models/userModel.js";
import Role from "../models/roleModel.js";
import Session from "../models/sessionModel.js";

import { verify } from "../../security/password.js";
import { computeEffectivePermissionsForUser } from "../services/permissionService.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeRefreshToken() {
  // 256-bit token
  return crypto.randomBytes(32).toString("hex");
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

    const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: process.env.ACCESS_TOKEN_TTL || "15m",
    });

    // Recommended: put refresh token in httpOnly cookie for scalability & security
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: THIRTY_DAYS_MS,
      path: "/",
    });

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
