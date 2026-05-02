import mongoose from "mongoose";

export const EXCHANGE_COUPON_STATUSES = ["ACTIVE", "RESERVED", "USED", "EXPIRED", "CANCELLED"];

const ExchangeCouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "StorefrontCustomer", index: true },
    exchangeCaseId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderItemId: { type: String, required: true, trim: true, index: true },
    valueAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR", trim: true },
    status: { type: String, enum: EXCHANGE_COUPON_STATUSES, default: "ACTIVE", index: true },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true, index: true },
    reservedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    currentReservationId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "CouponReservation" },
    consumedOrderId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "StorefrontCustomerOrder" },
  },
  {
    timestamps: true,
    collection: "exchange_coupons",
  }
);

ExchangeCouponSchema.index({ customerId: 1, status: 1, createdAt: -1 });

export default mongoose.models.ExchangeCoupon ||
  mongoose.model("ExchangeCoupon", ExchangeCouponSchema);
