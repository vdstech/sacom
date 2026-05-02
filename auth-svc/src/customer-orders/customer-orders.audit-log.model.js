import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    role: { type: String, default: "", trim: true },
    action: { type: String, required: true, trim: true },
    oldStatus: { type: String, default: "", trim: true },
    newStatus: { type: String, default: "", trim: true },
    referenceId: { type: String, default: "", trim: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    orderItemId: { type: String, default: "", trim: true, index: true },
    remarks: { type: String, default: "", trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: "order_audit_logs",
  }
);

export default mongoose.models.OrderAuditLog ||
  mongoose.model("OrderAuditLog", AuditLogSchema);
