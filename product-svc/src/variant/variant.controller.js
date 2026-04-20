import mongoose from "mongoose";
import Product from "../product/product.model.js";
import Variant from "./variant.model.js";
import Inventory from "../inventory/inventory.model.js";
import { getCategoryDefinitionConfig, validateVariantDetails } from "../product/categoryConfig.js";
import { mapAdminVariantListItem } from "../product/response.dto.js";

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeToken(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDiscount(input = {}) {
  const rawType = normalizeString(input?.type || "none").toLowerCase();
  const type = ["none", "percent", "flat"].includes(rawType) ? rawType : "none";
  const rawValue = Math.max(0, asNumber(input?.value, 0));
  return {
    type,
    value: type === "percent" ? Math.min(100, rawValue) : (type === "none" ? 0 : rawValue),
    label: normalizeString(input?.label),
  };
}

function normalizeColor(input) {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input === "string") {
    const name = normalizeString(input);
    return name ? { name } : null;
  }
  const name = normalizeString(input?.name);
  if (!name) return null;
  const hex = normalizeString(input?.hex);
  return hex ? { name, hex } : { name };
}

function normalizeColors(input) {
  const raw = Array.isArray(input)
    ? input
    : (input === undefined || input === null || input === "" ? [] : [input]);
  const seen = new Set();
  const normalized = [];

  for (const entry of raw) {
    const color = normalizeColor(entry);
    if (!color?.name) continue;
    const key = normalizeToken(color.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(color);
  }

  return normalized;
}

function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image, index) => {
      const url = normalizeString(image?.url);
      if (!url) return null;
      return {
        url,
        alt: normalizeString(image?.alt),
        sortOrder: Number.isFinite(Number(image?.sortOrder)) ? Number(image.sortOrder) : index,
      };
    })
    .filter(Boolean);
}

function buildStockKey(usedKeys = new Set()) {
  while (true) {
    const key = `STK-${new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase()}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    return key;
  }
}

function normalizeSizeOptions(config = {}) {
  const raw = Array.isArray(config?.variantOptions?.size?.options)
    ? config.variantOptions.size.options
    : [];
  return raw
    .map((option) => {
      const token = normalizeToken(option?.value || option?.label || "");
      if (!token) return null;
      const label = normalizeString(option?.label || option?.value || token) || token;
      return { token, label };
    })
    .filter(Boolean);
}

function normalizeColorOptions(config = {}) {
  const raw = Array.isArray(config?.variantOptions?.color?.options)
    ? config.variantOptions.color.options
    : [];
  return raw
    .map((option) => {
      const token = normalizeToken(option?.value || option?.label || "");
      if (!token) return null;
      const label = normalizeString(option?.label || option?.value || token) || token;
      return { token, label };
    })
    .filter(Boolean);
}

function extractRequestedColors(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, "colors")) return body.colors;
  if (Object.prototype.hasOwnProperty.call(body, "color")) return body.color;
  return undefined;
}

function compareDefaultPriority(a, b) {
  const aDefault = a?.isDefault ? 1 : 0;
  const bDefault = b?.isDefault ? 1 : 0;
  if (aDefault !== bDefault) return bDefault - aDefault;
  return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
}

async function loadProductConfig(productId) {
  const product = await Product.findById(productId).select("categoryId").lean();
  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  const categoryId = normalizeString(product.categoryId);
  const categoryConfig = await getCategoryDefinitionConfig(categoryId);
  return {
    product,
    resolvedConfig: categoryConfig.resolvedConfig || {},
  };
}

function validateColorsAgainstConfig(input, resolvedConfig) {
  const colorEnabled = !!resolvedConfig?.variantOptions?.color?.enabled;
  if (!colorEnabled) return [];

  const options = normalizeColorOptions(resolvedConfig);
  const normalized = normalizeColors(input);
  if (!options.length) return normalized;

  return normalized.map((color) => {
    const matched = options.find((option) => option.token === normalizeToken(color.name));
    if (!matched) {
      throw new Error(`Invalid color '${color.name}'. Allowed colors: ${options.map((option) => option.label).join(", ")}`);
    }
    return color.hex ? { name: matched.label, hex: color.hex } : { name: matched.label };
  });
}

function deriveVariantSizeLabel(stock = []) {
  const labels = (Array.isArray(stock) ? stock : [])
    .map((entry) => normalizeString(entry?.sizeLabel))
    .filter(Boolean);
  return labels.length === 1 ? labels[0] : "";
}

function normalizeSingleStockEntry(entry, fallback = {}) {
  return {
    stockKey: normalizeString(entry?.stockKey || fallback?.stockKey).toUpperCase(),
    sizeLabel: normalizeString(entry?.sizeLabel || fallback?.sizeLabel),
    quantity: Math.max(0, asNumber(entry?.quantity, fallback?.quantity || 0)),
    reorderLevel: Math.max(0, asNumber(entry?.reorderLevel, fallback?.reorderLevel || 0)),
  };
}

function normalizeStockEntries(inputStock, {
  existingStock = [],
  resolvedConfig = {},
} = {}) {
  const sizeEnabled = !!resolvedConfig?.variantOptions?.size?.enabled;
  const sizeOptions = normalizeSizeOptions(resolvedConfig);
  const incoming = Array.isArray(inputStock) ? inputStock : [];
  const usedKeys = new Set(
    (Array.isArray(existingStock) ? existingStock : [])
      .map((entry) => normalizeString(entry?.stockKey).toUpperCase())
      .filter(Boolean)
  );

  if (sizeEnabled) {
    if (!sizeOptions.length) {
      throw new Error("Category size configuration is empty");
    }

    const allowedByToken = new Map(sizeOptions.map((option) => [option.token, option.label]));
    const existingByToken = new Map();
    for (const entry of existingStock || []) {
      const token = normalizeToken(entry?.sizeLabel);
      if (token && !existingByToken.has(token)) existingByToken.set(token, entry);
    }

    const normalizedEntries = [];
    const seenTokens = new Set();
    for (const entry of incoming) {
      const rawSizeLabel = normalizeString(entry?.sizeLabel);
      const token = normalizeToken(rawSizeLabel);
      if (!token) throw new Error("stock.sizeLabel is required for sized categories");
      if (!allowedByToken.has(token)) {
        throw new Error(`Invalid size '${rawSizeLabel}'. Allowed sizes: ${sizeOptions.map((option) => option.label).join(", ")}`);
      }
      if (seenTokens.has(token)) {
        throw new Error(`Duplicate stock.sizeLabel: ${rawSizeLabel}`);
      }
      seenTokens.add(token);

      const fallback = existingByToken.get(token) || {};
      const normalized = normalizeSingleStockEntry(entry, fallback);
      if (!normalized.stockKey) normalized.stockKey = buildStockKey(usedKeys);
      normalized.sizeLabel = allowedByToken.get(token) || rawSizeLabel;
      normalizedEntries.push(normalized);
    }

    return normalizedEntries;
  }

  if (incoming.length > 1) {
    throw new Error("Only one stock entry is allowed when size is disabled");
  }

  const source = incoming[0] || existingStock?.[0] || {};
  const normalized = normalizeSingleStockEntry(source, existingStock?.[0] || {});
  if (!normalized.stockKey) normalized.stockKey = buildStockKey(usedKeys);
  normalized.sizeLabel = normalizeString(source?.sizeLabel || existingStock?.[0]?.sizeLabel);
  return [normalized];
}

function validateVariantDetailsAgainstConfig(details, resolvedConfig) {
  const result = validateVariantDetails(details || {}, resolvedConfig?.variantFieldDefinitions || []);
  if (result.errors.length) {
    throw new Error(result.errors.join("; "));
  }
  return result.normalized;
}

async function syncInventory({
  variantId,
  productId,
  stock,
  userId,
}) {
  const existing = await Inventory.find({ variantId }).select("_id stockKey").lean();
  const remainingByKey = new Map(
    existing.map((entry) => [normalizeString(entry?.stockKey).toUpperCase(), entry])
  );

  for (const entry of stock) {
    const stockKey = normalizeString(entry.stockKey).toUpperCase();
    const payload = {
      stockKey,
      productId,
      variantId,
      sizeLabel: normalizeString(entry.sizeLabel),
      quantity: Math.max(0, asNumber(entry.quantity, 0)),
      reorderLevel: Math.max(0, asNumber(entry.reorderLevel, 0)),
      updatedBy: userId || null,
    };

    const existingDoc = remainingByKey.get(stockKey);
    if (existingDoc?._id) {
      remainingByKey.delete(stockKey);
      await Inventory.findByIdAndUpdate(existingDoc._id, { $set: payload }, { runValidators: true });
    } else {
      await Inventory.create(payload);
    }
  }

  const staleIds = Array.from(remainingByKey.values()).map((entry) => entry._id);
  if (staleIds.length) {
    await Inventory.deleteMany({ _id: { $in: staleIds } });
  }
}

async function rebalanceDefaultVariant(productId, { preferVariantId = null, avoidVariantId = null } = {}) {
  const variants = await Variant.find({ productId })
    .select("_id isDefault createdAt")
    .lean();
  if (!variants.length) return;

  const sorted = [...variants].sort(compareDefaultPriority);
  const preferId = String(preferVariantId || "");
  const avoidId = String(avoidVariantId || "");

  let candidates = sorted;
  if (avoidId) {
    const filtered = sorted.filter((variant) => String(variant._id) !== avoidId);
    if (filtered.length) candidates = filtered;
  }

  let winner = null;
  if (preferId) {
    winner = candidates.find((variant) => String(variant._id) === preferId) || null;
  }
  if (!winner) {
    winner = candidates.find((variant) => variant.isDefault) || candidates[0];
  }
  if (!winner?._id) return;

  await Variant.updateMany(
    { productId, _id: { $ne: winner._id }, isDefault: true },
    { $set: { isDefault: false } }
  );

  if (!winner.isDefault) {
    await Variant.updateOne({ _id: winner._id }, { $set: { isDefault: true } });
  }
}

function mapVariantList(variants) {
  return variants.map((variant) =>
    mapAdminVariantListItem(variant, { stock: Array.isArray(variant.stock) ? variant.stock : [] })
  );
}

export async function createForProduct(req, res) {
  try {
    const productId = req.params.id;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "productId param is required" });
    }

    const { resolvedConfig } = await loadProductConfig(productId);
    const body = req.body || {};
    const colors = validateColorsAgainstConfig(extractRequestedColors(body), resolvedConfig);
    const stock = normalizeStockEntries(body.stock, { resolvedConfig });
    const details = validateVariantDetailsAgainstConfig(body.details, resolvedConfig);
    const images = normalizeImages(body.images);

    const hasExistingVariant = !!(await Variant.exists({ productId }));
    const requestedDefault = Object.prototype.hasOwnProperty.call(body, "isDefault") ? !!body.isDefault : false;
    const shouldBeDefault = requestedDefault || !hasExistingVariant;

    const variantId = new mongoose.Types.ObjectId();
    const doc = await Variant.create({
      _id: variantId,
      productId,
      price: Number(body.price),
      discount: normalizeDiscount(body.discount),
      images,
      colors,
      sizeLabel: deriveVariantSizeLabel(stock),
      stock,
      details,
      isDefault: shouldBeDefault,
      isActive: body.isActive !== undefined ? !!body.isActive : true,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    await syncInventory({
      variantId: doc._id,
      productId,
      stock,
      userId: req.user?._id || null,
    });

    await rebalanceDefaultVariant(productId, {
      preferVariantId: shouldBeDefault ? doc._id : null,
    });

    const variant = await Variant.findById(doc._id).lean();
    return res.status(201).json({
      variant: mapAdminVariantListItem(variant || doc, { stock }),
      warnings: [],
    });
  } catch (err) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.message });
    if (String(err?.message || "").startsWith("Invalid color '") || String(err?.message || "").startsWith("Invalid size '")) {
      return res.status(400).json({ error: err.message });
    }
    if (
      String(err?.message || "").includes("stock")
      || String(err?.message || "").includes("sizeLabel")
      || String(err?.message || "").includes("Only one stock entry")
      || String(err?.message || "").includes("Category size configuration")
      || String(err?.message || "").includes("variant.details.")
    ) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || "Failed to create variant" });
  }
}

export async function listForProduct(req, res) {
  try {
    const productId = req.params.id;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "productId param is required" });
    }

    const variants = await Variant.find({ productId })
      .select("_id productId price discount images colors color sizeLabel stock details isDefault isActive createdAt")
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    return res.json(mapVariantList(variants));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list variants" });
  }
}

export async function updateVariant(req, res) {
  try {
    const variantId = req.params.variantId;
    if (!mongoose.isValidObjectId(variantId)) {
      return res.status(400).json({ error: "variantId must be a valid ObjectId" });
    }

    const existingVariant = await Variant.findById(variantId).lean();
    if (!existingVariant) return res.status(404).json({ error: "Variant not found" });

    const { resolvedConfig } = await loadProductConfig(existingVariant.productId);
    const body = req.body || {};
    const patch = {
      updatedBy: req.user?._id || null,
    };

    if (Object.prototype.hasOwnProperty.call(body, "price")) patch.price = Number(body.price);
    if (Object.prototype.hasOwnProperty.call(body, "discount")) patch.discount = normalizeDiscount(body.discount);
    if (Object.prototype.hasOwnProperty.call(body, "images")) patch.images = normalizeImages(body.images);
    if (Object.prototype.hasOwnProperty.call(body, "isDefault")) patch.isDefault = !!body.isDefault;
    if (Object.prototype.hasOwnProperty.call(body, "isActive")) patch.isActive = !!body.isActive;

    const shouldTouchColors = Object.prototype.hasOwnProperty.call(body, "colors")
      || Object.prototype.hasOwnProperty.call(body, "color");
    if (shouldTouchColors) {
      patch.colors = validateColorsAgainstConfig(extractRequestedColors(body), resolvedConfig);
    }

    if (Object.prototype.hasOwnProperty.call(body, "details")) {
      patch.details = validateVariantDetailsAgainstConfig(
        { ...(existingVariant.details || {}), ...(body.details || {}) },
        resolvedConfig
      );
    }

    let stock = null;
    if (Object.prototype.hasOwnProperty.call(body, "stock")) {
      stock = normalizeStockEntries(body.stock, {
        existingStock: existingVariant.stock || [],
        resolvedConfig,
      });
      patch.stock = stock;
      patch.sizeLabel = deriveVariantSizeLabel(stock);
    }

    const update = shouldTouchColors
      ? { $set: patch, $unset: { color: 1 } }
      : patch;

    const variant = await Variant.findByIdAndUpdate(variantId, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (stock) {
      await syncInventory({
        variantId,
        productId: existingVariant.productId,
        stock,
        userId: req.user?._id || null,
      });
    }

    await rebalanceDefaultVariant(existingVariant.productId, {
      preferVariantId: patch.isDefault === true ? variantId : null,
      avoidVariantId: patch.isDefault === false && !!existingVariant.isDefault ? variantId : null,
    });

    const refreshedVariant = await Variant.findById(variantId).lean();
    return res.json({
      variant: mapAdminVariantListItem(refreshedVariant || variant, {
        stock: Array.isArray((refreshedVariant || variant)?.stock) ? (refreshedVariant || variant).stock : [],
      }),
      warnings: [],
    });
  } catch (err) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.message });
    if (String(err?.message || "").startsWith("Invalid color '") || String(err?.message || "").startsWith("Invalid size '")) {
      return res.status(400).json({ error: err.message });
    }
    if (
      String(err?.message || "").includes("stock")
      || String(err?.message || "").includes("sizeLabel")
      || String(err?.message || "").includes("Only one stock entry")
      || String(err?.message || "").includes("Category size configuration")
      || String(err?.message || "").includes("variant.details.")
    ) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || "Failed to update variant" });
  }
}
