import mongoose from "mongoose";

const CouponRedemptionSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: "ExchangeCoupon", index: true },
    reservationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "CouponReservation" },
    checkoutSessionId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "CheckoutSession" },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "StorefrontCustomerOrder", index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "StorefrontCustomer", index: true },
    appliedAmount: { type: Number, required: true, min: 0 },
    forfeitedAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "INR", trim: true },
  },
  {
    timestamps: true,
    collection: "coupon_redemptions",
  }
);

export default mongoose.models.CouponRedemption ||
  mongoose.model("CouponRedemption", CouponRedemptionSchema);
