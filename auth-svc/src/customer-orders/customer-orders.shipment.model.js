import mongoose from "mongoose";

const ShipmentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderItemId: { type: String, required: true, trim: true, index: true },
    courierName: { type: String, default: "", trim: true },
    trackingNumber: { type: String, default: "", trim: true },
    shippedAt: { type: Date, default: null },
    shippedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    status: { type: String, enum: ["PENDING", "SHIPPED"], default: "PENDING" },
  },
  {
    timestamps: true,
    collection: "order_shipments",
  }
);

export default mongoose.models.OrderShipment ||
  mongoose.model("OrderShipment", ShipmentSchema);
