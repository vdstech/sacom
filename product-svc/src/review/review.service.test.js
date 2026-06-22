import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  buildAdminReviewResponse,
  buildReviewResponse,
  createCustomerReview,
  deriveVerifiedBuyerMatch,
  listApprovedProductReviews,
  moderateReview,
} from "./review.service.js";
import { calculateApprovedReviewSummary } from "./review.summary.js";

function createQuery(results) {
  return {
    sort() { return this; },
    select() { return this; },
    skip() { return this; },
    limit() { return this; },
    lean() { return Promise.resolve(results); },
  };
}

function createFindByIdQuery(result) {
  return {
    select() {
      return {
        lean: async () => result,
      };
    },
  };
}

function createFindOneQuery(result) {
  return {
    select() {
      return {
        lean: async () => result,
      };
    },
    lean: async () => result,
  };
}

function approvedModeration() {
  return {
    status: "APPROVED",
    moderationReason: "AUTOMATED_MODERATION_PASSED",
    moderationNote: "Auto-approved after automated moderation.",
    moderationSource: "AUTO",
    moderationSignals: [],
    automatedModeration: {
      provider: "OPENAI",
      model: "omni-moderation-latest",
      decision: "APPROVED",
      reason: "AUTOMATED_MODERATION_PASSED",
      categories: [],
      scores: {},
      checkedAt: new Date(),
      requestId: "modr-test",
      failureReason: "",
    },
  };
}

function pendingModeration() {
  return {
    ...approvedModeration(),
    status: "PENDING",
    moderationReason: "AUTOMATED_MODERATION_FLAGGED",
    moderationNote: "Sent to manual review because automated moderation flagged the review.",
    moderationSignals: ["harassment"],
    automatedModeration: {
      ...approvedModeration().automatedModeration,
      decision: "PENDING",
      reason: "AUTOMATED_MODERATION_FLAGGED",
      categories: ["harassment"],
      scores: { harassment: 0.91 },
    },
  };
}

test("deriveVerifiedBuyerMatch marks delivered paid purchases as verified", async () => {
  const productId = new mongoose.Types.ObjectId().toString();
  const variantId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const orderId = new mongoose.Types.ObjectId().toString();

  const result = await deriveVerifiedBuyerMatch(
    { customerId, productId, variantId },
    {
      OrderModel: {
        find() {
          return createQuery([
            {
              _id: orderId,
              items: [
                {
                  lineId: "line-1",
                  productId,
                  variantId,
                  fulfillmentStatus: "DELIVERED",
                  deliveredAt: new Date("2026-06-01T10:00:00.000Z"),
                },
              ],
            },
          ]);
        },
      },
    }
  );

  assert.equal(result.verifiedBuyer, true);
  assert.equal(String(result.verificationOrderId), orderId);
  assert.equal(result.verificationOrderItemId, "line-1");
});

test("createCustomerReview derives verifiedBuyer on the backend and ignores fake frontend claims", async () => {
  const productId = new mongoose.Types.ObjectId().toString();
  const variantId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const auditEntries = [];

  const created = await createCustomerReview(
    {
      productId,
      customer: { _id: customerId, email: "buyer@example.com", name: "Verified Shopper" },
      payload: {
        rating: 5,
        title: "Loved it",
        comment: "Excellent fabric and finishing for the price.",
        variantId,
        verifiedBuyer: false,
      },
    },
    {
      ProductModel: {
        findById() { return createFindByIdQuery({ _id: productId, title: "Silk Saree", slug: "silk-saree" }); },
        updateOne: async () => ({ acknowledged: true }),
      },
      VariantModel: {
        findOne() { return createFindOneQuery({ _id: variantId, productId }); },
      },
      ReviewModel: {
        findOne: () => ({ lean: async () => null }),
        aggregate: async () => [
          {
            reviewCount: 1,
            ratingTotal: 5,
            verifiedBuyerReviewCount: 1,
            oneStar: 0,
            twoStar: 0,
            threeStar: 0,
            fourStar: 0,
            fiveStar: 1,
            lastReviewedAt: new Date(),
          },
        ],
        create: async (doc) => ({
          ...doc,
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject() { return this; },
        }),
      },
      OrderModel: {
        find() {
          return createQuery([
            {
              _id: new mongoose.Types.ObjectId(),
              items: [
                {
                  lineId: "line-9",
                  productId,
                  variantId,
                  fulfillmentStatus: "DELIVERED",
                  deliveredAt: new Date(),
                },
              ],
            },
          ]);
        },
      },
      recordAudit: async (entry) => {
        auditEntries.push(entry);
      },
      moderateReviewContent: async () => approvedModeration(),
      checkReviewRateLimit: async () => ({ limited: false, count: 0 }),
    }
  );

  assert.equal(created.verifiedBuyer, true);
  assert.equal(created.status, "APPROVED");
  assert.equal(created.verificationOrderItemId, "line-9");
  assert.equal(auditEntries[0].action, "REVIEW_CREATED");
  assert.equal(auditEntries[0].metadata.verifiedBuyer, true);
  assert.equal(auditEntries[0].metadata.moderationStatus, "APPROVED");
});

test("createCustomerReview keeps non-purchased reviews unverified and blocks duplicates", async () => {
  const productId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();

  const unverified = await createCustomerReview(
    {
      productId,
      customer: { _id: customerId, email: "guest@example.com", name: "Curious Buyer" },
      payload: {
        rating: 4,
        title: "Looks good",
        comment: "Sharing an opinion without a matching delivered purchase.",
      },
    },
    {
      ProductModel: {
        findById() { return createFindByIdQuery({ _id: productId, title: "Kurta", slug: "kurta" }); },
        updateOne: async () => ({ acknowledged: true }),
      },
      VariantModel: { findOne: async () => null },
      ReviewModel: {
        findOne: () => ({ lean: async () => null }),
        aggregate: async () => [
          {
            reviewCount: 1,
            ratingTotal: 4,
            verifiedBuyerReviewCount: 0,
            oneStar: 0,
            twoStar: 0,
            threeStar: 0,
            fourStar: 1,
            fiveStar: 0,
            lastReviewedAt: new Date(),
          },
        ],
        create: async (doc) => ({
          ...doc,
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject() { return this; },
        }),
      },
      OrderModel: {
        find() {
          return createQuery([]);
        },
      },
      recordAudit: async () => {},
      moderateReviewContent: async () => approvedModeration(),
      checkReviewRateLimit: async () => ({ limited: false, count: 0 }),
    }
  );

  assert.equal(unverified.verifiedBuyer, false);
  assert.equal(unverified.status, "APPROVED");

  await assert.rejects(
    () => createCustomerReview(
      {
        productId,
        customer: { _id: customerId, email: "guest@example.com", name: "Curious Buyer" },
        payload: {
          rating: 4,
          title: "Second review",
          comment: "Trying to submit another review for the same product.",
        },
      },
      {
        ProductModel: {
          findById() { return createFindByIdQuery({ _id: productId, title: "Kurta", slug: "kurta" }); },
        },
        ReviewModel: {
          findOne: () => ({ lean: async () => ({ _id: new mongoose.Types.ObjectId() }) }),
        },
      }
    ),
    /already submitted a review/
  );
});

test("createCustomerReview keeps flagged automated moderation pending for manual review", async () => {
  const productId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  let summaryRecalculated = false;

  const created = await createCustomerReview(
    {
      productId,
      customer: { _id: customerId, email: "guest@example.com", name: "Concerned Buyer" },
      payload: {
        rating: 1,
        title: "Suspicious",
        comment: "Click here http://one.example and http://two.example for free money.",
      },
    },
    {
      ProductModel: {
        findById() { return createFindByIdQuery({ _id: productId, title: "Kurta", slug: "kurta" }); },
        updateOne: async () => {
          summaryRecalculated = true;
          return { acknowledged: true };
        },
      },
      ReviewModel: {
        findOne: () => ({ lean: async () => null }),
        aggregate: async () => [],
        create: async (doc) => ({
          ...doc,
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject() { return this; },
        }),
      },
      OrderModel: {
        find() {
          return createQuery([]);
        },
      },
      recordAudit: async () => {},
      moderateReviewContent: async () => pendingModeration(),
      checkReviewRateLimit: async () => ({ limited: false, count: 0 }),
    }
  );

  assert.equal(created.status, "PENDING");
  assert.equal(summaryRecalculated, false);
});

test("createCustomerReview keeps rate-limited customer reviews pending without calling the provider", async () => {
  const productId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  let moderationCalled = false;

  const created = await createCustomerReview(
    {
      productId,
      customer: { _id: customerId, email: "buyer@example.com", name: "Fast Reviewer" },
      payload: { rating: 3, title: "Review", comment: "A valid review that needs manual review due to rate limits." },
    },
    {
      ProductModel: {
        findById() { return createFindByIdQuery({ _id: productId, title: "Kurta", slug: "kurta" }); },
        updateOne: async () => ({ acknowledged: true }),
      },
      ReviewModel: {
        findOne: () => ({ lean: async () => null }),
        aggregate: async () => [],
        create: async (doc) => ({ ...doc, _id: new mongoose.Types.ObjectId(), toObject() { return this; } }),
      },
      OrderModel: { find() { return createQuery([]); } },
      checkReviewRateLimit: async () => ({ limited: true, count: 5 }),
      moderateReviewContent: async () => {
        moderationCalled = true;
        return approvedModeration();
      },
      recordAudit: async () => {},
    }
  );

  assert.equal(created.status, "PENDING");
  assert.equal(moderationCalled, false);
});

test("listApprovedProductReviews returns only approved reviews and stable pagination data", async () => {
  const productId = new mongoose.Types.ObjectId().toString();
  let matchUsed = null;

  const payload = await listApprovedProductReviews(
    { productId, page: 1, limit: 10 },
    {
      ReviewModel: {
        find(match) {
          matchUsed = match;
          return createQuery([
            {
              _id: new mongoose.Types.ObjectId(),
              productId,
              customerId: new mongoose.Types.ObjectId(),
              customerDisplayName: "Asha",
              rating: 5,
              title: "Great",
              comment: "Wonderful",
              verifiedBuyer: true,
              status: "APPROVED",
            },
          ]);
        },
        countDocuments: async () => 1,
      },
      ProductModel: {
        findById() { return createFindByIdQuery({ ratingSummary: { averageRating: 5, reviewCount: 1, distribution: { 5: 1 } } }); },
      },
    }
  );

  assert.equal(matchUsed.status, "APPROVED");
  assert.equal(payload.reviews.length, 1);
  assert.equal(payload.summary?.reviewCount, 1);
  assert.equal(payload.totalPages, 1);
});

test("automated moderation scores are included for admins but omitted from public review responses", () => {
  const review = {
    _id: new mongoose.Types.ObjectId(),
    productId: new mongoose.Types.ObjectId(),
    customerId: new mongoose.Types.ObjectId(),
    customerDisplayName: "Asha",
    rating: 5,
    title: "Great",
    comment: "Wonderful fabric.",
    status: "APPROVED",
    automatedModeration: {
      provider: "OPENAI",
      model: "omni-moderation-latest",
      decision: "APPROVED",
      reason: "AUTOMATED_MODERATION_PASSED",
      categories: [],
      scores: { harassment: 0.002 },
      checkedAt: new Date(),
      requestId: "modr-safe",
    },
  };

  assert.equal(buildReviewResponse(review).automatedModeration, undefined);
  assert.equal(buildAdminReviewResponse(review).automatedModeration.provider, "OPENAI");
  assert.equal(buildAdminReviewResponse(review).automatedModeration.scores.harassment, 0.002);
});

test("calculateApprovedReviewSummary uses approved reviews only", async () => {
  const productId = new mongoose.Types.ObjectId().toString();
  const summary = await calculateApprovedReviewSummary(productId, {
    ReviewModel: {
      aggregate: async () => [
        {
          reviewCount: 2,
          ratingTotal: 9,
          verifiedBuyerReviewCount: 1,
          oneStar: 0,
          twoStar: 0,
          threeStar: 0,
          fourStar: 1,
          fiveStar: 1,
          lastReviewedAt: new Date("2026-06-01T10:00:00.000Z"),
        },
      ],
    },
  });

  assert.equal(summary.averageRating, 4.5);
  assert.equal(summary.reviewCount, 2);
  assert.equal(summary.distribution[5], 1);
});

test("moderateReview emits audit events and recalculates product summary", async () => {
  const productId = new mongoose.Types.ObjectId();
  const reviewId = new mongoose.Types.ObjectId().toString();
  const actorId = new mongoose.Types.ObjectId().toString();
  const auditEntries = [];

  const reviewDoc = {
    _id: reviewId,
    productId,
    customerId: new mongoose.Types.ObjectId(),
    customerDisplayName: "Priya",
    rating: 4,
    title: "Balanced",
    comment: "Nicely made product.",
    verifiedBuyer: true,
    status: "PENDING",
    moderationReason: "",
    moderationNote: "",
    automatedModeration: {
      provider: "OPENAI",
      model: "omni-moderation-latest",
      decision: "PENDING",
      reason: "AUTOMATED_MODERATION_FLAGGED",
      categories: ["harassment"],
      scores: { harassment: 0.91 },
    },
    toObject() { return { ...this }; },
    async save() {
      this.updatedAt = new Date();
      return this;
    },
  };

  const reviewed = await moderateReview(
    {
      reviewId,
      status: "APPROVED",
      moderationReason: "Looks valid",
      moderationNote: "Approved after manual review",
      actorId,
    },
    {
      ReviewModel: {
        findById: async () => reviewDoc,
        aggregate: async () => [
          {
            reviewCount: 1,
            ratingTotal: 4,
            verifiedBuyerReviewCount: 1,
            oneStar: 0,
            twoStar: 0,
            threeStar: 0,
            fourStar: 1,
            fiveStar: 0,
            lastReviewedAt: new Date(),
          },
        ],
      },
      ProductModel: {
        updateOne: async () => ({ acknowledged: true }),
      },
      recordAudit: async (entry) => {
        auditEntries.push(entry);
      },
    }
  );

  assert.equal(reviewed.status, "APPROVED");
  assert.equal(auditEntries[0].action, "REVIEW_APPROVED");
  assert.equal(auditEntries[0].metadata.productId, String(productId));
  assert.equal(auditEntries[0].metadata.ratingSummary.reviewCount, 1);
  assert.equal(reviewDoc.automatedModeration.provider, "OPENAI");
});

test("moderateReview supports rejected and hidden outcomes", async () => {
  const productId = new mongoose.Types.ObjectId();
  const reviewId = new mongoose.Types.ObjectId().toString();
  const auditEntries = [];

  const reviewDoc = {
    _id: reviewId,
    productId,
    customerId: new mongoose.Types.ObjectId(),
    customerDisplayName: "Priya",
    rating: 2,
    title: "Too harsh",
    comment: "This review needs moderation.",
    verifiedBuyer: false,
    status: "PENDING",
    moderationReason: "",
    moderationNote: "",
    toObject() { return { ...this }; },
    async save() {
      this.updatedAt = new Date();
      return this;
    },
  };

  await moderateReview(
    {
      reviewId,
      status: "REJECTED",
      moderationReason: "Contains unsupported claims",
      moderationNote: "Rejected in test",
      actorId: new mongoose.Types.ObjectId().toString(),
    },
    {
      ReviewModel: {
        findById: async () => reviewDoc,
        aggregate: async () => [],
      },
      ProductModel: {
        updateOne: async () => ({ acknowledged: true }),
      },
      recordAudit: async (entry) => {
        auditEntries.push(entry);
      },
    }
  );

  assert.equal(reviewDoc.status, "REJECTED");
  assert.equal(auditEntries[0].action, "REVIEW_REJECTED");

  await moderateReview(
    {
      reviewId,
      status: "HIDDEN",
      moderationReason: "Hidden from public view",
      moderationNote: "Hidden in test",
      actorId: new mongoose.Types.ObjectId().toString(),
    },
    {
      ReviewModel: {
        findById: async () => reviewDoc,
        aggregate: async () => [],
      },
      ProductModel: {
        updateOne: async () => ({ acknowledged: true }),
      },
      recordAudit: async (entry) => {
        auditEntries.push(entry);
      },
    }
  );

  assert.equal(reviewDoc.status, "HIDDEN");
  assert.equal(auditEntries[1].action, "REVIEW_HIDDEN");
});
