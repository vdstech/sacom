import mongoose from "mongoose";

const CancellationCaseSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderItemId: { type: String, required: true, trim: true, index: true },
    source: { type: String, enum: ["CUSTOMER", "ADMIN"], required: true },
    reason: { type: String, default: "", trim: true },
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN", index: true },
    requestedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    closedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    closedAt: { type: Date, default: null },
    resolution: {
      type: String,
      enum: ["", "RESTOCKED", "DAMAGED", "LOST"],
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "order_item_cancellation_cases",
  }
);

CancellationCaseSchema.index({ orderItemId: 1, status: 1 });

export default mongoose.models.CancellationCase ||
  mongoose.model("CancellationCase", CancellationCaseSchema);
