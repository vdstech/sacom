import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Store only the hash of refresh token (never store raw token)
    refreshTokenHash: { type: String, required: true },

    // Computed at login/refresh to avoid deep permission lookups on every request
    effectivePermissions: { type: [String], default: [] },

    // Session expiry; TTL index below will auto-delete expired sessions
    expiresAt: { type: Date, required: true, index: true },

    // Operational metadata
    lastSeenAt: { type: Date, default: Date.now },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  {
    timestamps: true, collection: "backend_sessions"
  } // adds createdAt/updatedAt
);

// TTL index: Mongo deletes docs when expiresAt < now
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Session", SessionSchema);
