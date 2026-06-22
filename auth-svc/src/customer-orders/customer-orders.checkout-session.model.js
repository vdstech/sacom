import mongoose from "mongoose";

export const CHECKOUT_SESSION_STATUSES = ["ACTIVE", "COMPLETED", "PAYMENT_FAILED", "ABANDONED", "EXPIRED"];

const CheckoutPricingSnapshotSchema = new mongoose.Schema(
  {
    version: { type: Number, default: 1, min: 1 },
    currency: { type: String, default: "INR", trim: true },
    pricingRuleVersion: { type: Number, default: 1, min: 1 },
    priceIncludesTax: { type: Boolean, default: true },
    taxMode: { type: String, default: "inclusive", trim: true },
    subtotalBeforeCoupon: { type: Number, default: 0, min: 0 },
    catalogDiscountTotal: { type: Number, default: 0, min: 0 },
    couponDiscountTotal: { type: Number, default: 0, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    discountedMerchandiseTotalBeforeCoupon: { type: Number, default: 0, min: 0 },
    discountedMerchandiseTotal: { type: Number, default: 0, min: 0 },
    taxableBaseTotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    includedTaxTotal: { type: Number, default: 0, min: 0 },
    shippingTotal: { type: Number, default: 0, min: 0 },
    shippingTaxTotal: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    payableTotal: { type: Number, default: 0, min: 0 },
    allocationMode: { type: String, default: "order_level_only", trim: true },
    taxRatesUsed: { type: [Number], default: [] },
    shippingRule: {
      key: { type: String, default: "flat_zero", trim: true },
      label: { type: String, default: "", trim: true },
      amount: { type: Number, default: 0, min: 0 },
      standardCharge: { type: Number, default: 0, min: 0 },
      freeThreshold: { type: Number, default: 0, min: 0 },
      eligibleSubtotal: { type: Number, default: 0, min: 0 },
      shippingTaxMode: { type: String, default: "not_calculated_v1", trim: true },
      shippingTaxTotal: { type: Number, default: 0, min: 0 },
    },
    taxRule: {
      key: { type: String, default: "inclusive_default_rate", trim: true },
      label: { type: String, default: "", trim: true },
      defaultRate: { type: Number, default: 0, min: 0 },
      ratePercent: { type: Number, default: 0, min: 0 },
      amount: { type: Number, default: 0, min: 0 },
      taxMode: { type: String, default: "inclusive", trim: true },
    },
    calculatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

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
    discountTotal: { type: Number, default: 0, min: 0 },
    taxableBaseTotal: { type: Number, default: 0, min: 0 },
    includedTaxTotal: { type: Number, default: 0, min: 0 },
    shippingTotal: { type: Number, default: 0, min: 0 },
    couponAppliedAmount: { type: Number, default: 0, min: 0 },
    payableAmount: { type: Number, default: 0, min: 0 },
    forfeitureAmount: { type: Number, default: 0, min: 0 },
    pricingSnapshot: { type: CheckoutPricingSnapshotSchema, default: () => ({}) },
    paymentStatus: { type: String, default: "pending", trim: true },
    lastAttemptedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureCode: { type: String, default: "", trim: true },
    failureReason: { type: String, default: "", trim: true },
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
