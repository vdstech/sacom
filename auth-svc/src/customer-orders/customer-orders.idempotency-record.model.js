import mongoose from "mongoose";

export const IDEMPOTENCY_RECORD_STATUSES = ["IN_PROGRESS", "COMPLETED", "FAILED"];

const IdempotencyRecordSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "StorefrontCustomer", index: true },
    routeKey: { type: String, required: true, trim: true },
    idempotencyKey: { type: String, required: true, trim: true },
    requestHash: { type: String, required: true, trim: true },
    status: { type: String, enum: IDEMPOTENCY_RECORD_STATUSES, default: "IN_PROGRESS", index: true },
    responseStatus: { type: Number, default: 0 },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: "", trim: true },
    lockedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "idempotency_records",
  }
);

IdempotencyRecordSchema.index({ customerId: 1, routeKey: 1, idempotencyKey: 1 }, { unique: true });

export default mongoose.models.IdempotencyRecord ||
  mongoose.model("IdempotencyRecord", IdempotencyRecordSchema);
