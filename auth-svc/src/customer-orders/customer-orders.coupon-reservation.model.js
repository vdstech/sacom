import mongoose from "mongoose";

export const COUPON_RESERVATION_STATUSES = ["RESERVED", "RELEASED", "EXPIRED", "CONSUMED"];

const CouponReservationSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "ExchangeCoupon", index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "StorefrontCustomer", index: true },
    checkoutSessionId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "CheckoutSession", index: true },
    reservedAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: COUPON_RESERVATION_STATUSES, default: "RESERVED", index: true },
    expiresAt: { type: Date, required: true, index: true },
    releasedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
    releaseReason: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
    collection: "coupon_reservations",
  }
);

CouponReservationSchema.index(
  { couponId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "RESERVED" } }
);

export default mongoose.models.CouponReservation ||
  mongoose.model("CouponReservation", CouponReservationSchema);
