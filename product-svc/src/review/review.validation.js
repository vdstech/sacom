import mongoose from "mongoose";

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validateReviewBody(body = {}) {
  const rating = asNumber(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return "rating must be an integer between 1 and 5";
  }

  const title = normalizeString(body.title);
  if (!title) return "title is required";
  if (title.length < 3) return "title must be at least 3 characters";
  if (title.length > 120) return "title must be 120 characters or fewer";

  const comment = normalizeString(body.comment);
  if (!comment) return "comment is required";
  if (comment.length < 10) return "comment must be at least 10 characters";
  if (comment.length > 2000) return "comment must be 2000 characters or fewer";

  if (body.variantId !== undefined && body.variantId !== null && body.variantId !== "") {
    if (!mongoose.isValidObjectId(body.variantId)) {
      return "variantId must be a valid ObjectId";
    }
  }

  return null;
}

export function validateCreateReview(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.productId)) {
    return res.status(400).json({ error: "productId must be a valid ObjectId" });
  }

  const error = validateReviewBody(req.body || {});
  if (error) return res.status(400).json({ error });
  return next();
}

export function validateModerateReview(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.reviewId)) {
    return res.status(400).json({ error: "reviewId must be a valid ObjectId" });
  }

  const moderationReason = normalizeString(req.body?.moderationReason);
  const moderationNote = normalizeString(req.body?.moderationNote);
  if (moderationReason.length > 240) {
    return res.status(400).json({ error: "moderationReason must be 240 characters or fewer" });
  }
  if (moderationNote.length > 1000) {
    return res.status(400).json({ error: "moderationNote must be 1000 characters or fewer" });
  }
  return next();
}

export function validateReviewProductId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.productId)) {
    return res.status(400).json({ error: "productId must be a valid ObjectId" });
  }
  return next();
}
