import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    refreshTokenHash: { type: String, required: true },
    effectivePermissions: { type: [String], default: [] },
    expiresAt: { type: Date, required: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  {
    timestamps: true,
    collection: "backend_sessions",
  }
);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Session", SessionSchema);
