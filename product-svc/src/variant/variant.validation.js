import mongoose from "mongoose";

const RETURN_TYPES = new Set(["none", "exchange", "refund", "exchange_or_refund"]);
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

function validateCommon(body, requireColorName) {
  if (body.price !== undefined && asNumber(body.price) === null) {
    return "price must be a number";
  }

  const colorName = body?.merchandise?.color?.name;
  if (requireColorName && (!colorName || !String(colorName).trim())) {
    return "merchandise.color.name is required";
  }

  const hex = body?.merchandise?.color?.hex;
  if (hex && !HEX_COLOR_RE.test(String(hex).trim())) {
    return "merchandise.color.hex must be a valid hex color (#RGB or #RRGGBB)";
  }

  const blouseLen = body?.merchandise?.blouse?.lengthMeters;
  if (blouseLen !== undefined) {
    const n = asNumber(blouseLen);
    if (n === null || n < 0) return "merchandise.blouse.lengthMeters must be a non-negative number";
  }

  const saree = body?.merchandise?.saree;
  if (saree) {
    for (const key of ["lengthMeters", "widthMeters", "weightGrams"]) {
      if (saree[key] !== undefined) {
        const n = asNumber(saree[key]);
        if (n === null || n < 0) return `merchandise.saree.${key} must be a non-negative number`;
      }
    }
  }

  const policyError = validateReturnPolicy(body?.merchandise?.returnPolicyOverride, "merchandise.returnPolicyOverride");
  if (policyError) return policyError;

  return null;
}

export function validateCreate(req, res, next) {
  const { sku, price } = req.body;
  const productId = req.params.id;

  if (!productId || !mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ error: "productId param is required" });
  }

  if (!sku || !String(sku).trim()) {
    return res.status(400).json({ error: "sku is required" });
  }

  if (price === undefined || Number.isNaN(Number(price))) {
    return res.status(400).json({ error: "price is required and must be a number" });
  }

  const err = validateCommon(req.body, true);
  if (err) return res.status(400).json({ error: err });

  next();
}

export function validateUpdate(req, res, next) {
  if (req.params.variantId && !mongoose.isValidObjectId(req.params.variantId)) {
    return res.status(400).json({ error: "variantId must be a valid ObjectId" });
  }

  const err = validateCommon(req.body, false);
  if (err) return res.status(400).json({ error: err });

  next();
}
