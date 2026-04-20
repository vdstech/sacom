import mongoose from "mongoose";

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function validateReturnPolicy(policy, label) {
  if (!policy || typeof policy !== "object") return null;

  const returnable = policy.returnable === undefined ? undefined : !!policy.returnable;
  const windowDays = policy.windowDays === undefined ? undefined : asNumber(policy.windowDays);

  if (windowDays !== undefined && (windowDays === null || windowDays < 0)) {
    return `${label}.windowDays must be a non-negative number`;
  }
  if (returnable === true && windowDays !== undefined && windowDays < 1) {
    return `${label}.windowDays must be at least 1 when returnable is true`;
  }

  return null;
}

function validateCommon(req) {
  if (req.body.categoryId && !mongoose.isValidObjectId(req.body.categoryId)) {
    return "categoryId must be a valid ObjectId";
  }

  const policyError = validateReturnPolicy(req.body.returnPolicy, "returnPolicy");
  if (policyError) return policyError;

  return null;
}

export function validateCreate(req, res, next) {
  const { title, categoryId } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
    return res.status(400).json({ error: "categoryId is required and must be a valid ObjectId" });
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
