import mongoose from "mongoose";

const RETURN_TYPES = new Set(["none", "exchange", "refund", "exchange_or_refund"]);

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function validateReturnPolicy(policy, label) {
  if (!policy || typeof policy !== "object") return null;

  const returnable = policy.returnable === undefined ? undefined : !!policy.returnable;
  const windowDays = policy.windowDays === undefined ? undefined : asNumber(policy.windowDays);
  const type = policy.type === undefined ? undefined : String(policy.type || "").trim();

  if (windowDays !== undefined && (windowDays === null || windowDays < 0)) {
    return `${label}.windowDays must be a non-negative number`;
  }
  if (type !== undefined && !RETURN_TYPES.has(type)) {
    return `${label}.type must be one of: none, exchange, refund, exchange_or_refund`;
  }
  if (returnable === false && windowDays !== undefined && windowDays > 0) {
    return `${label}.windowDays must be 0 when returnable is false`;
  }
  if (returnable === true && windowDays !== undefined && windowDays < 1) {
    return `${label}.windowDays must be at least 1 when returnable is true`;
  }

  return null;
}

function validateCommon(req) {
  if (req.body.primaryCategoryId && !mongoose.isValidObjectId(req.body.primaryCategoryId)) {
    return "primaryCategoryId must be a valid ObjectId";
  }

  if (req.body.categoryIds !== undefined) {
    if (!Array.isArray(req.body.categoryIds)) return "categoryIds must be an array";
    if (req.body.categoryIds.some((id) => !mongoose.isValidObjectId(id))) {
      return "categoryIds must contain valid ObjectIds";
    }
  }

  const blouseLen = req.body.blouseDefault?.lengthMeters;
  if (blouseLen !== undefined) {
    const n = asNumber(blouseLen);
    if (n === null || n < 0) return "blouseDefault.lengthMeters must be a non-negative number";
  }

  const policyError = validateReturnPolicy(req.body.returnPolicyDefault, "returnPolicyDefault");
  if (policyError) return policyError;

  return null;
}

export function validateCreate(req, res, next) {
  const { title, primaryCategoryId } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (!primaryCategoryId || !mongoose.isValidObjectId(primaryCategoryId)) {
    return res.status(400).json({ error: "primaryCategoryId is required and must be a valid ObjectId" });
  }

  const err = validateCommon(req);
  if (err) return res.status(400).json({ error: err });

  next();
}

export function validateUpdate(req, res, next) {
  const err = validateCommon(req);
  if (err) return res.status(400).json({ error: err });
  next();
}
