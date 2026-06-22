import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
  {
    service: { type: String, required: true, trim: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, default: "", trim: true, index: true },
    entityDisplayId: { type: String, default: "", trim: true },
    actor: {
      actorType: { type: String, default: "SYSTEM", trim: true },
      userId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
      email: { type: String, default: "", trim: true },
      name: { type: String, default: "", trim: true },
      role: { type: String, default: "", trim: true },
      roleNames: { type: [String], default: [] },
    },
    request: {
      requestId: { type: String, default: "", trim: true, index: true },
      method: { type: String, default: "", trim: true },
      path: { type: String, default: "", trim: true },
      ipAddress: { type: String, default: "", trim: true },
      userAgent: { type: String, default: "", trim: true },
    },
    result: { type: String, enum: ["SUCCESS", "FAILURE"], default: "SUCCESS", index: true },
    failureReason: { type: String, default: "", trim: true },
    changes: {
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: "audit_logs",
  }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ "actor.userId": 1, createdAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ result: 1, createdAt: -1 });

export default mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
