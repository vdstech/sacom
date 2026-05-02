import mongoose from "mongoose";

const PhysicalHandoverSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderItemId: { type: String, required: true, trim: true, index: true },
    type: {
      type: String,
      enum: ["PROCESSING_TO_PACKAGING", "PACKAGING_TO_SHIPPING", "CURRENT_OWNER_TO_CANCELLATION"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING_RECEIPT", "RECEIVED", "REJECTED", "LOST_IN_HANDOVER"],
      default: "PENDING_RECEIPT",
    },
    fromOwner: { type: String, default: "", trim: true },
    toOwner: { type: String, default: "", trim: true },
    handedOverByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    handedOverAt: { type: Date, default: Date.now },
    receivedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    receivedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
    collection: "order_item_handovers",
  }
);

PhysicalHandoverSchema.index({ orderItemId: 1, status: 1 });

export default mongoose.models.PhysicalHandover ||
  mongoose.model("PhysicalHandover", PhysicalHandoverSchema);
