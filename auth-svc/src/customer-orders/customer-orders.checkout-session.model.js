import mongoose from "mongoose";

export const CHECKOUT_SESSION_STATUSES = ["ACTIVE", "COMPLETED", "ABANDONED", "EXPIRED"];

const CheckoutSessionSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "StorefrontCustomer", index: true },
    cartToken: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: CHECKOUT_SESSION_STATUSES, default: "ACTIVE", index: true },
    addressId: { type: mongoose.Schema.Types.ObjectId, default: null },
    couponId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "ExchangeCoupon" },
    reservationId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "CouponReservation" },
    couponCode: { type: String, default: "", trim: true, uppercase: true },
    currency: { type: String, default: "INR", trim: true },
    subtotal: { type: Number, default: 0, min: 0 },
    couponAppliedAmount: { type: Number, default: 0, min: 0 },
    payableAmount: { type: Number, default: 0, min: 0 },
    forfeitureAmount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true, index: true },
    completedAt: { type: Date, default: null },
    abandonedAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "checkout_sessions",
  }
);

CheckoutSessionSchema.index({ customerId: 1, status: 1, updatedAt: -1 });

export default mongoose.models.CheckoutSession ||
  mongoose.model("CheckoutSession", CheckoutSessionSchema);
