import {
  createCustomerReview,
  getAdminReviewById,
  getCustomerProductReview,
  listAdminReviews,
  listApprovedProductReviews,
  moderateReview,
} from "./review.service.js";

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function getReviewCustomer(req) {
  return req.customer || {
    _id: req.customerAuth?.customerId,
    email: "",
    name: "",
  };
}

export async function listApprovedReviews(req, res) {
  try {
    const payload = await listApprovedProductReviews({
      productId: req.params.productId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load reviews" });
  }
}

export async function getMyReview(req, res) {
  try {
    const review = await getCustomerProductReview({
      productId: req.params.productId,
      customerId: req.customerAuth?.customerId,
    });
    return res.json({ review });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load review" });
  }
}

export async function createReview(req, res) {
  try {
    const review = await createCustomerReview({
      productId: req.params.productId,
      customer: getReviewCustomer(req),
      payload: req.body || {},
      req,
    });
    return res.status(201).json({ review });
  } catch (err) {
    const statusCode = Number(err?.statusCode || 500);
    return res.status(statusCode).json({ error: err.message || "Failed to create review" });
  }
}

export async function adminListReviews(req, res) {
  try {
    const payload = await listAdminReviews(req.query || {});
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load reviews" });
  }
}

export async function adminGetReview(req, res) {
  try {
    const review = await getAdminReviewById(req.params.reviewId);
    if (!review) return res.status(404).json({ error: "Review not found" });
    return res.json({ review });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load review" });
  }
}

async function moderate(req, res, status) {
  try {
    const review = await moderateReview({
      reviewId: req.params.reviewId,
      status,
      moderationReason: normalizeString(req.body?.moderationReason),
      moderationNote: normalizeString(req.body?.moderationNote),
      actorId: req.user?._id || null,
      req,
    });
    return res.json({ review });
  } catch (err) {
    const statusCode = Number(err?.statusCode || 500);
    return res.status(statusCode).json({ error: err.message || "Failed to moderate review" });
  }
}

export async function approveReview(req, res) {
  return moderate(req, res, "APPROVED");
}

export async function rejectReview(req, res) {
  return moderate(req, res, "REJECTED");
}

export async function hideReview(req, res) {
  return moderate(req, res, "HIDDEN");
}
