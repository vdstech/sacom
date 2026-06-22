import mongoose from "mongoose";

const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED", "HIDDEN"];
const MODERATION_SOURCES = ["", "AUTO", "MANUAL"];

const AutomatedModerationSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "", trim: true, maxlength: 80 },
    model: { type: String, default: "", trim: true, maxlength: 160 },
    decision: { type: String, enum: ["", "APPROVED", "PENDING"], default: "" },
    reason: { type: String, default: "", trim: true, maxlength: 240 },
    categories: [{ type: String, trim: true, maxlength: 120 }],
    scores: { type: Map, of: Number, default: () => ({}) },
    checkedAt: { type: Date, default: null },
    requestId: { type: String, default: "", trim: true, maxlength: 160 },
    failureReason: { type: String, default: "", trim: true, maxlength: 160 },
  },
  { _id: false }
);

const RatingDistributionSchema = new mongoose.Schema(
  {
    1: { type: Number, default: 0, min: 0 },
    2: { type: Number, default: 0, min: 0 },
    3: { type: Number, default: 0, min: 0 },
    4: { type: Number, default: 0, min: 0 },
    5: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

export function buildEmptyRatingSummary() {
  return {
    averageRating: 0,
    reviewCount: 0,
    verifiedBuyerReviewCount: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    lastReviewedAt: null,
  };
}

const ReviewSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", default: null, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    customerDisplayName: { type: String, required: true, trim: true, maxlength: 160 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    verifiedBuyer: { type: Boolean, default: false, index: true },
    verificationOrderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    verificationOrderItemId: { type: String, default: "", trim: true },
    status: { type: String, enum: REVIEW_STATUSES, default: "PENDING", index: true },
    moderationReason: { type: String, default: "", trim: true, maxlength: 240 },
    moderationNote: { type: String, default: "", trim: true, maxlength: 1000 },
    moderationSource: { type: String, enum: MODERATION_SOURCES, default: "", index: true },
    moderationSignals: [{ type: String, trim: true, maxlength: 120 }],
    automatedModeration: { type: AutomatedModerationSchema, default: () => ({}) },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
    collection: "product_reviews",
  }
);

ReviewSchema.index({ productId: 1, customerId: 1 }, { unique: true });
ReviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ status: 1, verifiedBuyer: 1, createdAt: -1 });

ReviewSchema.pre("validate", function (next) {
  this.customerDisplayName = String(this.customerDisplayName || "").trim();
  this.title = String(this.title || "").trim();
  this.comment = String(this.comment || "").trim();
  this.moderationReason = String(this.moderationReason || "").trim();
  this.moderationNote = String(this.moderationNote || "").trim();
  this.moderationSource = String(this.moderationSource || "").trim().toUpperCase();
  this.moderationSignals = Array.isArray(this.moderationSignals)
    ? this.moderationSignals.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (this.automatedModeration) {
    this.automatedModeration.provider = String(this.automatedModeration.provider || "").trim().toUpperCase();
    this.automatedModeration.model = String(this.automatedModeration.model || "").trim();
    this.automatedModeration.decision = String(this.automatedModeration.decision || "").trim().toUpperCase();
    this.automatedModeration.reason = String(this.automatedModeration.reason || "").trim();
    this.automatedModeration.categories = Array.isArray(this.automatedModeration.categories)
      ? this.automatedModeration.categories.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    this.automatedModeration.requestId = String(this.automatedModeration.requestId || "").trim();
    this.automatedModeration.failureReason = String(this.automatedModeration.failureReason || "").trim();
  }
  this.verificationOrderItemId = String(this.verificationOrderItemId || "").trim();
  this.status = String(this.status || "PENDING").trim().toUpperCase();
  next();
});

export const ProductRatingSummarySchema = new mongoose.Schema(
  {
    averageRating: { type: Number, default: 0, min: 0 },
    reviewCount: { type: Number, default: 0, min: 0 },
    verifiedBuyerReviewCount: { type: Number, default: 0, min: 0 },
    distribution: { type: RatingDistributionSchema, default: () => ({}) },
    lastReviewedAt: { type: Date, default: null },
  },
  { _id: false }
);

const Review = mongoose.models.ProductReview || mongoose.model("ProductReview", ReviewSchema);

export async function syncReviewIndexes(logger = null) {
  try {
    await Review.syncIndexes();
    if (logger?.info) logger.info("Review indexes synced");
  } catch (err) {
    if (logger?.warn) {
      logger.warn({ err }, "Failed to sync review indexes");
      return;
    }
    throw err;
  }
}

export default Review;
