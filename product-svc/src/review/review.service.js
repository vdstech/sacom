import mongoose from "mongoose";
import Product from "../product/product.model.js";
import Variant from "../variant/variant.model.js";
import Review from "./review.model.js";
import ReviewCustomerOrderRead from "./review.customer-order-read.model.js";
import { recalculateProductRatingSummary } from "./review.summary.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import {
  checkReviewRateLimit,
  getReviewModerationConfig,
  moderateReviewContent as runReviewModeration,
} from "./review.moderation.js";

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function toObjectId(value) {
  return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

function coerceBooleanFilter(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

function buildCustomerDisplayName(customer = {}) {
  const name = normalizeString(customer?.name);
  if (name) return name;
  const email = normalizeString(customer?.email);
  if (!email) return "Customer";
  return email.split("@")[0] || "Customer";
}

function normalizeRating(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : 0;
}

function mapAutomatedModeration(value = {}) {
  const scores = value?.scores instanceof Map
    ? Object.fromEntries(value.scores.entries())
    : value?.scores && typeof value.scores === "object"
      ? Object.fromEntries(Object.entries(value.scores).filter(([, score]) => Number.isFinite(Number(score))))
      : {};
  return {
    provider: normalizeString(value?.provider),
    model: normalizeString(value?.model),
    decision: normalizeString(value?.decision).toUpperCase(),
    reason: normalizeString(value?.reason),
    categories: Array.isArray(value?.categories) ? value.categories.map((entry) => normalizeString(entry)).filter(Boolean) : [],
    scores,
    checkedAt: value?.checkedAt || null,
    requestId: normalizeString(value?.requestId),
    failureReason: normalizeString(value?.failureReason),
  };
}

function buildReviewResponse(review = {}, { includeAutomatedModeration = false } = {}) {
  return {
    id: String(review?._id || review?.id || ""),
    productId: String(review?.productId || ""),
    variantId: review?.variantId ? String(review.variantId) : "",
    customerId: String(review?.customerId || ""),
    customerDisplayName: normalizeString(review?.customerDisplayName),
    rating: normalizeRating(review?.rating),
    title: normalizeString(review?.title),
    comment: normalizeString(review?.comment),
    verifiedBuyer: !!review?.verifiedBuyer,
    verificationOrderId: review?.verificationOrderId ? String(review.verificationOrderId) : "",
    verificationOrderItemId: normalizeString(review?.verificationOrderItemId),
    status: normalizeString(review?.status, "PENDING").toUpperCase(),
    approvedAt: review?.approvedAt || null,
    rejectedAt: review?.rejectedAt || null,
    hiddenAt: review?.hiddenAt || null,
    createdAt: review?.createdAt || null,
    updatedAt: review?.updatedAt || null,
    ...(includeAutomatedModeration ? {
      moderationReason: normalizeString(review?.moderationReason),
      moderationNote: normalizeString(review?.moderationNote),
      moderationSource: normalizeString(review?.moderationSource),
      moderationSignals: Array.isArray(review?.moderationSignals)
        ? review.moderationSignals.map((entry) => normalizeString(entry)).filter(Boolean)
        : [],
      automatedModeration: mapAutomatedModeration(review?.automatedModeration),
    } : {}),
  };
}

function buildAdminReviewResponse(review = {}, extras = {}) {
  return {
    ...buildReviewResponse(review, { includeAutomatedModeration: true }),
    product: extras.product || null,
    variant: extras.variant || null,
    verificationOrder: extras.verificationOrder || null,
  };
}

export async function deriveVerifiedBuyerMatch(
  { customerId, productId, variantId = "" },
  deps = {}
) {
  const OrderModel = deps.OrderModel || ReviewCustomerOrderRead;
  const customerObjectId = toObjectId(customerId);
  const productObjectId = toObjectId(productId);
  const variantObjectId = toObjectId(variantId);
  if (!customerObjectId || !productObjectId) {
    return {
      verifiedBuyer: false,
      verificationOrderId: null,
      verificationOrderItemId: "",
      verificationRule: "",
    };
  }

  const orders = await OrderModel.find({
    customer: customerObjectId,
    paymentStatus: "paid",
    "items.productId": productObjectId,
  })
    .sort({ placedAt: -1 })
    .select("_id displayId paymentStatus placedAt items")
    .lean();

  for (const order of orders) {
    const items = Array.isArray(order?.items) ? order.items : [];
    for (const item of items) {
      if (String(item?.productId || "") !== String(productObjectId)) continue;
      if (variantObjectId && String(item?.variantId || "") !== String(variantObjectId)) continue;
      if (item?.cancelledAt) continue;
      const delivered = normalizeString(item?.fulfillmentStatus).toUpperCase() === "DELIVERED" || !!item?.deliveredAt;
      if (!delivered) continue;
      return {
        verifiedBuyer: true,
        verificationOrderId: order?._id || null,
        verificationOrderItemId: normalizeString(item?.lineId),
        verificationRule: "paid_delivered_item",
      };
    }
  }

  return {
    verifiedBuyer: false,
    verificationOrderId: null,
    verificationOrderItemId: "",
    verificationRule: "no_matching_delivered_order_item",
  };
}

async function findProductOrThrow(productId, deps = {}) {
  const ProductModel = deps.ProductModel || Product;
  const product = await ProductModel.findById(productId).select("_id title slug ratingSummary").lean();
  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }
  return product;
}

async function findVariantForProduct(productId, variantId, deps = {}) {
  if (!variantId) return null;
  const VariantModel = deps.VariantModel || Variant;
  return VariantModel.findOne({ _id: variantId, productId })
    .select("_id productId colors sizeLabel")
    .lean();
}

export async function createCustomerReview(
  { productId, customer, payload = {}, req = null },
  deps = {}
) {
  const ReviewModel = deps.ReviewModel || Review;
  const auditRecorder = deps.recordAudit || recordAuditEvent;
  const moderationConfig = deps.moderationConfig || getReviewModerationConfig();
  const customerId = toObjectId(customer?._id || customer?.id);
  await findProductOrThrow(productId, deps);

  const existing = await ReviewModel.findOne({
    productId: toObjectId(productId),
    customerId,
  }).lean();
  if (existing) {
    const error = new Error("You already submitted a review for this product");
    error.statusCode = 409;
    throw error;
  }

  const variant = await findVariantForProduct(productId, payload.variantId, deps);
  if (payload.variantId && !variant) {
    const error = new Error("Variant not found for this product");
    error.statusCode = 400;
    throw error;
  }

  const verification = await deriveVerifiedBuyerMatch({
    customerId: customer?._id || customer?.id,
    productId,
    variantId: payload.variantId || "",
  }, deps);
  const rateLimit = await (deps.checkReviewRateLimit || checkReviewRateLimit)({
    customerId,
    ReviewModel,
    config: moderationConfig,
  });
  const moderation = rateLimit.limited
    ? {
      status: "PENDING",
      moderationReason: "REVIEW_RATE_LIMITED",
      moderationNote: "Sent to manual review because the customer submitted reviews too quickly.",
      moderationSource: "AUTO",
      moderationSignals: ["review_rate_limit"],
      automatedModeration: {
        provider: "LOCAL",
        model: "",
        decision: "PENDING",
        reason: "REVIEW_RATE_LIMITED",
        categories: [],
        scores: {},
        checkedAt: new Date(),
        requestId: "",
        failureReason: "RATE_LIMIT",
      },
    }
    : await (deps.moderateReviewContent || runReviewModeration)({
      title: payload.title,
      comment: payload.comment,
    }, {
      config: moderationConfig,
      fetchImpl: deps.fetchImpl,
      sleep: deps.sleep,
    });
  const autoApproved = moderation.status === "APPROVED";
  const now = new Date();

  const created = await ReviewModel.create({
    productId: toObjectId(productId),
    variantId: variant?._id || null,
    customerId,
    customerDisplayName: buildCustomerDisplayName(customer),
    rating: normalizeRating(payload.rating),
    title: normalizeString(payload.title),
    comment: normalizeString(payload.comment),
    verifiedBuyer: !!verification.verifiedBuyer,
    verificationOrderId: verification.verificationOrderId,
    verificationOrderItemId: verification.verificationOrderItemId,
    status: moderation.status,
    moderationReason: moderation.moderationReason,
    moderationNote: moderation.moderationNote,
    moderationSource: moderation.moderationSource,
    moderationSignals: moderation.moderationSignals,
    automatedModeration: moderation.automatedModeration,
    approvedAt: autoApproved ? now : null,
    approvedBy: null,
  });

  const ratingSummary = autoApproved
    ? await recalculateProductRatingSummary(created.productId, deps)
    : null;

  await auditRecorder({
    req,
    actor: {
      actorType: "CUSTOMER",
      userId: customer?._id || customer?.id,
      email: customer?.email,
      name: customer?.name,
      role: "CUSTOMER",
    },
    action: "REVIEW_CREATED",
    entityType: "REVIEW",
    entityId: String(created._id),
    entityDisplayId: String(created._id),
    after: created.toObject ? created.toObject() : created,
    metadata: {
      productId: String(productId),
      variantId: variant?._id ? String(variant._id) : "",
      verifiedBuyer: !!verification.verifiedBuyer,
      verificationOrderId: verification.verificationOrderId ? String(verification.verificationOrderId) : "",
      verificationOrderItemId: verification.verificationOrderItemId,
      verificationRule: verification.verificationRule,
      moderationStatus: moderation.status,
      moderationReason: moderation.moderationReason,
      moderationSignals: moderation.moderationSignals,
      automatedModeration: moderation.automatedModeration,
      ratingSummary,
    },
  });

  return buildReviewResponse(created);
}

export async function getCustomerProductReview({ productId, customerId }, deps = {}) {
  const ReviewModel = deps.ReviewModel || Review;
  const review = await ReviewModel.findOne({
    productId: toObjectId(productId),
    customerId: toObjectId(customerId),
  }).lean();
  return review ? buildReviewResponse(review) : null;
}

export async function listApprovedProductReviews({ productId, page = 1, limit = 10 }, deps = {}) {
  const ReviewModel = deps.ReviewModel || Review;
  const ProductModel = deps.ProductModel || Product;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const match = {
    productId: toObjectId(productId),
    status: "APPROVED",
  };

  const [reviews, total, product] = await Promise.all([
    ReviewModel.find(match)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    ReviewModel.countDocuments(match),
    ProductModel.findById(productId).select("ratingSummary").lean(),
  ]);

  return {
    reviews: (reviews || []).map((review) => buildReviewResponse(review)),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: total ? Math.ceil(total / safeLimit) : 1,
    summary: product?.ratingSummary || {
      averageRating: 0,
      reviewCount: 0,
      verifiedBuyerReviewCount: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      lastReviewedAt: null,
    },
  };
}

function buildModerationPatch(status, actorId, moderationReason, moderationNote) {
  const now = new Date();
  const patch = {
    status,
    moderationReason,
    moderationNote,
    moderationSource: "MANUAL",
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    hiddenAt: null,
    hiddenBy: null,
  };
  if (status === "APPROVED") {
    patch.approvedAt = now;
    patch.approvedBy = actorId || null;
  }
  if (status === "REJECTED") {
    patch.rejectedAt = now;
    patch.rejectedBy = actorId || null;
  }
  if (status === "HIDDEN") {
    patch.hiddenAt = now;
    patch.hiddenBy = actorId || null;
  }
  return patch;
}

export async function moderateReview(
  { reviewId, status, moderationReason = "", moderationNote = "", actorId = null, req = null },
  deps = {}
) {
  const ReviewModel = deps.ReviewModel || Review;
  const auditRecorder = deps.recordAudit || recordAuditEvent;
  const review = await ReviewModel.findById(reviewId);
  if (!review) {
    const error = new Error("Review not found");
    error.statusCode = 404;
    throw error;
  }

  const before = review.toObject ? review.toObject() : { ...review };
  Object.assign(
    review,
    buildModerationPatch(status, actorId ? toObjectId(actorId) : null, normalizeString(moderationReason), normalizeString(moderationNote))
  );
  await review.save();
  const summary = await recalculateProductRatingSummary(review.productId, deps);

  const action = status === "APPROVED"
    ? "REVIEW_APPROVED"
    : status === "REJECTED"
      ? "REVIEW_REJECTED"
      : "REVIEW_HIDDEN";

  await auditRecorder({
    req,
    action,
    entityType: "REVIEW",
    entityId: String(review._id),
    entityDisplayId: String(review._id),
    before,
    after: review.toObject ? review.toObject() : review,
    metadata: {
      productId: String(review.productId || ""),
      customerId: String(review.customerId || ""),
      verifiedBuyer: !!review.verifiedBuyer,
      moderationReason: normalizeString(moderationReason),
      moderationNote: normalizeString(moderationNote),
      ratingSummary: summary,
    },
  });

  return buildReviewResponse(review);
}

async function attachAdminReviewContext(reviews = [], deps = {}) {
  const ProductModel = deps.ProductModel || Product;
  const VariantModel = deps.VariantModel || Variant;
  const productIds = Array.from(new Set(reviews.map((review) => String(review?.productId || "")).filter(Boolean)));
  const variantIds = Array.from(new Set(reviews.map((review) => String(review?.variantId || "")).filter(Boolean)));
  const verificationOrderIds = Array.from(new Set(reviews.map((review) => String(review?.verificationOrderId || "")).filter(Boolean)));

  const [products, variants, orders] = await Promise.all([
    productIds.length
      ? ProductModel.find({ _id: { $in: productIds } }).select("_id title slug").lean()
      : [],
    variantIds.length
      ? VariantModel.find({ _id: { $in: variantIds } }).select("_id sizeLabel colors").lean()
      : [],
    verificationOrderIds.length
      ? (deps.OrderModel || ReviewCustomerOrderRead).find({ _id: { $in: verificationOrderIds } }).select("_id displayId").lean()
      : [],
  ]);

  const productMap = new Map(products.map((product) => [String(product._id), {
    id: String(product._id),
    title: normalizeString(product.title),
    slug: normalizeString(product.slug),
  }]));
  const variantMap = new Map(variants.map((variant) => [String(variant._id), {
    id: String(variant._id),
    sizeLabel: normalizeString(variant.sizeLabel),
    colorNames: Array.isArray(variant.colors) ? variant.colors.map((entry) => normalizeString(entry?.name)).filter(Boolean) : [],
  }]));
  const orderMap = new Map(orders.map((order) => [String(order._id), {
    id: String(order._id),
    displayId: normalizeString(order.displayId),
  }]));

  return reviews.map((review) => buildAdminReviewResponse(review, {
    product: productMap.get(String(review.productId || "")) || null,
    variant: review.variantId ? (variantMap.get(String(review.variantId)) || null) : null,
    verificationOrder: review.verificationOrderId ? (orderMap.get(String(review.verificationOrderId)) || null) : null,
  }));
}

export async function listAdminReviews(query = {}, deps = {}) {
  const ReviewModel = deps.ReviewModel || Review;
  const ProductModel = deps.ProductModel || Product;
  const safePage = Math.max(1, Number(query.page) || 1);
  const safeLimit = Math.max(1, Math.min(50, Number(query.limit) || 25));
  const match = {};

  const status = normalizeString(query.status).toUpperCase();
  if (status) match.status = status;

  const rating = Number(query.rating);
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) match.rating = rating;

  const verifiedBuyer = coerceBooleanFilter(query.verifiedBuyer);
  if (verifiedBuyer !== null) match.verifiedBuyer = verifiedBuyer;

  if (mongoose.isValidObjectId(query.productId)) {
    match.productId = new mongoose.Types.ObjectId(query.productId);
  }

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const productMatches = await ProductModel.find({
      $or: [{ title: searchRegex }, { slug: searchRegex }],
    }).select("_id").lean();
    const productIds = productMatches.map((product) => product._id);
    match.$or = [
      { title: searchRegex },
      { comment: searchRegex },
      { customerDisplayName: searchRegex },
      ...(productIds.length ? [{ productId: { $in: productIds } }] : []),
    ];
  }

  const [rows, total] = await Promise.all([
    ReviewModel.find(match)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    ReviewModel.countDocuments(match),
  ]);

  return {
    items: await attachAdminReviewContext(rows, deps),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: total ? Math.ceil(total / safeLimit) : 1,
  };
}

export async function getAdminReviewById(reviewId, deps = {}) {
  const ReviewModel = deps.ReviewModel || Review;
  const review = await ReviewModel.findById(reviewId).lean();
  if (!review) return null;
  const [shaped] = await attachAdminReviewContext([review], deps);
  return shaped || null;
}

export { buildReviewResponse, buildAdminReviewResponse };
