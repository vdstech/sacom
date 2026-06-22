import mongoose from "mongoose";

const OrderItemEscalationSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderItemId: { type: String, required: true, trim: true, index: true },
    lane: { type: String, required: true, trim: true, index: true },
    responsibleOwner: { type: String, default: "", trim: true },
    triggeredAt: { type: Date, required: true, default: Date.now },
    hoursPending: { type: Number, default: 0, min: 0 },
    reason: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED"],
      default: "OPEN",
      index: true,
    },
    resolvedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "order_item_escalations",
  }
);

OrderItemEscalationSchema.index({ orderItemId: 1, lane: 1, status: 1 });

export default mongoose.models.OrderItemEscalation ||
  mongoose.model("OrderItemEscalation", OrderItemEscalationSchema);
