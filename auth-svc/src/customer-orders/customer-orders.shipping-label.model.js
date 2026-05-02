import mongoose from "mongoose";

const ShippingLabelSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderItemId: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ["NOT_PRINTED", "PRINTED"], default: "NOT_PRINTED" },
    printedAt: { type: Date, default: null },
    printedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    reprintCount: { type: Number, default: 0, min: 0 },
    reprintReason: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
    collection: "shipping_labels",
  }
);

export default mongoose.models.ShippingLabel ||
  mongoose.model("ShippingLabel", ShippingLabelSchema);
