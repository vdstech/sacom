import mongoose from "mongoose";

const DISCOUNT_TYPES = new Set(["none", "percent", "flat"]);
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function validateDiscount(discount) {
  if (discount === undefined) return null;
  if (!discount || typeof discount !== "object") {
    return "discount must be an object";
  }

  const discountType = String(discount.type || "none").trim();
  const discountValue = asNumber(discount.value === undefined ? 0 : discount.value);
  if (!DISCOUNT_TYPES.has(discountType)) {
    return "discount.type must be one of: none, percent, flat";
  }
  if (discountValue === null || discountValue < 0) {
    return "discount.value must be a non-negative number";
  }
  if (discountType === "percent" && discountValue > 100) {
    return "discount.value must be <= 100 for percent type";
  }
  return null;
}

function validateColor(color) {
  if (color === undefined || color === null || color === "") return null;
  if (typeof color === "string") return null;
  if (!color || typeof color !== "object") {
    return "color must be a string or an object";
  }
  const hex = color.hex;
  if (hex && !HEX_COLOR_RE.test(String(hex).trim())) {
    return "color.hex must be a valid hex color (#RGB or #RRGGBB)";
  }
  return null;
}

function validateColors(colors) {
  if (colors === undefined) return null;
  if (colors === null || colors === "") return null;
  if (!Array.isArray(colors)) {
    return "colors must be an array";
  }
  for (const color of colors) {
    const error = validateColor(color);
    if (error) return error.replace(/^color\b/, "colors[]");
  }
  return null;
}

function validateSizeLabel(sizeLabel) {
  if (sizeLabel === undefined || sizeLabel === null || sizeLabel === "") return null;
  if (typeof sizeLabel !== "string") {
    return "sizeLabel must be a string";
  }
  return null;
}

function validateDetails(details) {
  if (details === undefined) return null;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "details must be an object";
  }
  return null;
}

function validateStockEntries(stock, { required }) {
  if (stock === undefined) {
    if (required) return "stock is required and must be a non-empty array";
    return null;
  }
  if (!Array.isArray(stock) || stock.length === 0) {
    return "stock must be a non-empty array";
  }

  const seenSizes = new Set();
  const seenKeys = new Set();

  for (const entry of stock) {
    const stockKey = String(entry?.stockKey || "").trim().toUpperCase();
    if (stockKey) {
      if (seenKeys.has(stockKey)) return `Duplicate stock.stockKey: ${stockKey}`;
      seenKeys.add(stockKey);
    }

    const sizeLabel = String(entry?.sizeLabel || "").trim();
    if (sizeLabel) {
      const token = sizeLabel.toLowerCase();
      if (seenSizes.has(token)) return `Duplicate stock.sizeLabel: ${sizeLabel}`;
      seenSizes.add(token);
    }

    if (entry?.quantity !== undefined && asNumber(entry.quantity) === null) {
      return "stock.quantity must be a number";
    }
    if (entry?.reorderLevel !== undefined && asNumber(entry.reorderLevel) === null) {
      return "stock.reorderLevel must be a number";
    }
  }

  return null;
}

function validateCommon(body, { requireStock }) {
  if (body.price !== undefined && asNumber(body.price) === null) {
    return "price must be a number";
  }

  const discountError = validateDiscount(body.discount);
  if (discountError) return discountError;

  if (body.colors !== undefined && body.color !== undefined) {
    return "Provide either colors or color, not both";
  }

  const colorError = body.colors !== undefined
    ? validateColors(body.colors)
    : validateColor(body.color);
  if (colorError) return colorError;

  const sizeError = validateSizeLabel(body.sizeLabel);
  if (sizeError) return sizeError;

  const detailsError = validateDetails(body.details);
  if (detailsError) return detailsError;

  const stockError = validateStockEntries(body.stock, { required: requireStock });
  if (stockError) return stockError;

  return null;
}

export function validateCreate(req, res, next) {
  const { price } = req.body;
  const productId = req.params.id;

  if (!productId || !mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ error: "productId param is required" });
  }

  if (price === undefined || Number.isNaN(Number(price))) {
    return res.status(400).json({ error: "price is required and must be a number" });
  }

  if (!Array.isArray(req.body.images) || req.body.images.length === 0) {
    return res.status(400).json({ error: "At least one variant image is required" });
  }
  if (req.body.images.some((image) => !image || !String(image.url || "").trim())) {
    return res.status(400).json({ error: "Each variant image must include a valid url" });
  }

  const err = validateCommon(req.body, { requireStock: true });
  if (err) return res.status(400).json({ error: err });

  next();
}

export function validateUpdate(req, res, next) {
  if (req.params.variantId && !mongoose.isValidObjectId(req.params.variantId)) {
    return res.status(400).json({ error: "variantId must be a valid ObjectId" });
  }

  const err = validateCommon(req.body, { requireStock: false });
  if (err) return res.status(400).json({ error: err });

  next();
}
