import mongoose from "mongoose";
import {
  RETURN_EXCHANGE_KINDS,
  RETURN_EXCHANGE_STATUSES,
  getRequestedStatusForKind,
} from "./customer-orders.return-exchange.shared.js";

const ReturnExchangeCaseSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderItemId: { type: String, required: true, trim: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "StorefrontCustomer", index: true },
    kind: { type: String, enum: RETURN_EXCHANGE_KINDS, required: true },
    status: {
      type: String,
      enum: RETURN_EXCHANGE_STATUSES,
      default() {
        return getRequestedStatusForKind(this.kind || "RETURN");
      },
      index: true,
    },
    reason: { type: String, required: true, trim: true },
    phoneNumber: { type: String, default: "", trim: true },
    whatsappNumber: { type: String, default: "", trim: true },
    courierName: { type: String, default: "", trim: true },
    returnTrackingNumber: { type: String, default: "", trim: true },
    decisionNote: { type: String, default: "", trim: true },
    investigationStartedAt: { type: Date, default: null },
    investigationStartedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    acceptedAt: { type: Date, default: null },
    acceptedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    rejectedAt: { type: Date, default: null },
    rejectedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    trackingUpdatedAt: { type: Date, default: null },
    trackingUpdatedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    receivedAt: { type: Date, default: null },
    receivedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    placeholderCreatedAt: { type: Date, default: null },
    placeholderCreatedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    couponId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "ExchangeCoupon", index: true },
    couponGeneratedAt: { type: Date, default: null },
    couponGeneratedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
  },
  {
    timestamps: true,
    collection: "order_item_return_exchange_cases",
  }
);

ReturnExchangeCaseSchema.index({ kind: 1, status: 1, createdAt: -1 });

export default mongoose.models.ReturnExchangeCase ||
  mongoose.model("ReturnExchangeCase", ReturnExchangeCaseSchema);
