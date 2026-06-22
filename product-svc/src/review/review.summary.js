import mongoose from "mongoose";
import Product from "../product/product.model.js";
import Review, { buildEmptyRatingSummary } from "./review.model.js";

function roundRating(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export async function calculateApprovedReviewSummary(productId, deps = {}) {
  const ReviewModel = deps.ReviewModel || Review;
  const targetProductId = mongoose.isValidObjectId(productId)
    ? new mongoose.Types.ObjectId(productId)
    : null;
  if (!targetProductId) return buildEmptyRatingSummary();

  const results = await ReviewModel.aggregate([
    { $match: { productId: targetProductId, status: "APPROVED" } },
    {
      $group: {
        _id: null,
        reviewCount: { $sum: 1 },
        ratingTotal: { $sum: "$rating" },
        verifiedBuyerReviewCount: {
          $sum: { $cond: ["$verifiedBuyer", 1, 0] },
        },
        oneStar: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        twoStar: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
        threeStar: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
        fourStar: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
        fiveStar: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
        lastReviewedAt: { $max: "$updatedAt" },
      },
    },
  ]);

  const summary = results[0];
  if (!summary) return buildEmptyRatingSummary();

  return {
    averageRating: summary.reviewCount ? roundRating(summary.ratingTotal / summary.reviewCount) : 0,
    reviewCount: Number(summary.reviewCount || 0),
    verifiedBuyerReviewCount: Number(summary.verifiedBuyerReviewCount || 0),
    distribution: {
      1: Number(summary.oneStar || 0),
      2: Number(summary.twoStar || 0),
      3: Number(summary.threeStar || 0),
      4: Number(summary.fourStar || 0),
      5: Number(summary.fiveStar || 0),
    },
    lastReviewedAt: summary.lastReviewedAt || null,
  };
}

export async function recalculateProductRatingSummary(productId, deps = {}) {
  const ProductModel = deps.ProductModel || Product;
  const summary = await calculateApprovedReviewSummary(productId, deps);
  await ProductModel.updateOne(
    { _id: productId },
    { $set: { ratingSummary: summary } }
  );
  return summary;
}
