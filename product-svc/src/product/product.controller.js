import mongoose from "mongoose";
import Product from "./product.model.js";
import Variant from "../variant/variant.model.js";
import Inventory from "../inventory/inventory.model.js";
import Category from "../category/category.model.js";

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeString(value, fallback = "") {
  const text = String(value ?? fallback).trim();
  return text;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeCarePolicy(input = {}) {
  return {
    washCare: normalizeStringArray(input.washCare),
    ironCare: normalizeString(input.ironCare),
    bleach: normalizeString(input.bleach),
    dryClean: normalizeString(input.dryClean),
    dryInstructions: normalizeString(input.dryInstructions),
  };
}

function normalizeReturnPolicy(input = {}) {
  const returnable = !!input.returnable;
  const windowDays = Math.max(0, asNumber(input.windowDays, 0));
  const normalized = {
    returnable,
    windowDays: returnable ? Math.max(1, windowDays) : 0,
    type: normalizeString(input.type || (returnable ? "exchange_or_refund" : "none"), returnable ? "exchange_or_refund" : "none"),
    notes: normalizeString(input.notes),
  };

  if (!returnable) normalized.type = "none";
  return normalized;
}

function normalizeMaterialProfile(input = {}) {
  return {
    fabric: normalizeString(input.fabric),
    weave: normalizeString(input.weave),
    workType: normalizeString(input.workType),
    pattern: normalizeString(input.pattern),
    borderStyle: normalizeString(input.borderStyle),
    palluStyle: normalizeString(input.palluStyle),
  };
}

function normalizeBlouseDefault(input = {}) {
  return {
    included: !!input.included,
    type: normalizeString(input.type),
    lengthMeters: Math.max(0, asNumber(input.lengthMeters, 0)),
  };
}

function buildAvailability(inventoryDocs) {
  if (!inventoryDocs || inventoryDocs.length === 0) return false;
  return inventoryDocs.some(
    (inv) => Number(inv.availableQty || 0) > 0 || !!inv.allowBackorder
  );
}

function buildPriceRange(variants) {
  if (!variants || variants.length === 0) return { min: null, max: null };
  const prices = variants.map((variant) => Number(variant.price || 0));
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

function buildColorSummary(variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return { colorNames: [], swatches: [], hasMultipleColors: false };
  }

  const sorted = [...variants].sort((a, b) => {
    const aDefault = a?.isDefault ? 1 : 0;
    const bDefault = b?.isDefault ? 1 : 0;
    if (aDefault !== bDefault) return bDefault - aDefault;

    const aSort = Number(a?.sortOrder || 0);
    const bSort = Number(b?.sortOrder || 0);
    if (aSort !== bSort) return aSort - bSort;

    return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
  });

  const seen = new Set();
  const swatches = [];

  for (const variant of sorted) {
    const name = String(variant?.merchandise?.color?.name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    const hex = String(variant?.merchandise?.color?.hex || "").trim();
    swatches.push(hex ? { name, hex } : { name });
  }

  const colorNames = swatches.map((item) => item.name);
  return {
    colorNames,
    swatches,
    hasMultipleColors: colorNames.length > 1,
  };
}

function resolveEffectiveCare(inventoryDoc, variantDoc, productDoc) {
  if (inventoryDoc?.care) return inventoryDoc.care;
  if (variantDoc?.merchandise?.careOverride) return variantDoc.merchandise.careOverride;
  return productDoc?.careDefault || null;
}

function resolveEffectiveReturnPolicy(inventoryDoc, variantDoc, productDoc) {
  if (inventoryDoc?.returnPolicy) return inventoryDoc.returnPolicy;
  if (variantDoc?.merchandise?.returnPolicyOverride) return variantDoc.merchandise.returnPolicyOverride;
  return productDoc?.returnPolicyDefault || null;
}

export async function create(req, res) {
  try {
    const body = req.body;

    const doc = await Product.create({
      title: normalizeString(body.title),
      slug: body.slug ? slugify(body.slug) : slugify(body.title),
      description: normalizeString(body.description),
      shortDescription: normalizeString(body.shortDescription),
      primaryCategoryId: new mongoose.Types.ObjectId(body.primaryCategoryId),
      categoryIds: (Array.isArray(body.categoryIds) && body.categoryIds.length)
        ? body.categoryIds.map((id) => new mongoose.Types.ObjectId(id))
        : [new mongoose.Types.ObjectId(body.primaryCategoryId)],
      tags: normalizeStringArray(body.tags),
      currency: normalizeString(body.currency || "INR", "INR"),
      images: Array.isArray(body.images) ? body.images : [],
      materialProfile: normalizeMaterialProfile(body.materialProfile),
      occasionTags: normalizeStringArray(body.occasionTags),
      blouseDefault: normalizeBlouseDefault(body.blouseDefault),
      careDefault: normalizeCarePolicy(body.careDefault),
      returnPolicyDefault: normalizeReturnPolicy(body.returnPolicyDefault),
      attributes: body.attributes && typeof body.attributes === "object" ? body.attributes : {},
      isActive: body.isActive !== undefined ? !!body.isActive : true,
      isFeatured: !!body.isFeatured,
      sortOrder: asNumber(body.sortOrder, 0),
      seoTitle: normalizeString(body.seoTitle),
      seoDescription: normalizeString(body.seoDescription),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Product slug already exists" });
    res.status(500).json({ error: err.message || "Failed to create product" });
  }
}

export async function list(req, res) {
  try {
    const docs = await listProducts(req.query);
    res.json(docs);
  } catch (err) {
    if (err?.message?.includes("categoryId must be a valid ObjectId")) {
      return res.status(400).json({ error: "categoryId must be a valid ObjectId" });
    }
    res.status(500).json({ error: err.message || "Failed to list products" });
  }
}

export async function adminList(req, res) {
  try {
    const docs = await listProducts({
      ...req.query,
      isActive: req.query.isActive === undefined ? "all" : req.query.isActive,
    });
    res.json(docs);
  } catch (err) {
    if (err?.message?.includes("categoryId must be a valid ObjectId")) {
      return res.status(400).json({ error: "categoryId must be a valid ObjectId" });
    }
    res.status(500).json({ error: err.message || "Failed to list products" });
  }
}

export async function adminGetById(req, res) {
  try {
    const doc = await Product.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Product not found" });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch product" });
  }
}

export async function listByCategorySlug(req, res) {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const category = await Category.findOne({ slug }).lean();
    if (!category) return res.status(404).json({ error: "Category not found" });
    const docs = await listProducts({ ...req.query, categoryId: category._id.toString() });
    res.json(docs);
  } catch (err) {
    if (err?.message?.includes("categoryId must be a valid ObjectId")) {
      return res.status(400).json({ error: "categoryId must be a valid ObjectId" });
    }
    res.status(500).json({ error: err.message || "Failed to list products" });
  }
}

export async function getBySlug(req, res) {
  try {
    const doc = await Product.findOne({ slug: String(req.params.slug).toLowerCase() }).lean();
    if (!doc) return res.status(404).json({ error: "Product not found" });

    const variants = await Variant.find({ productId: doc._id, isActive: true })
      .sort({ isDefault: -1, sortOrder: 1, createdAt: 1 })
      .lean();

    const variantIds = variants.map((variant) => variant._id);
    const inventoryDocs = variantIds.length
      ? await Inventory.find({ variantId: { $in: variantIds } }).lean()
      : [];

    const inventoryByVariant = new Map(
      inventoryDocs.map((inv) => [String(inv.variantId), inv])
    );

    const variantsWithInventory = variants.map((variant) => {
      const inventory = inventoryByVariant.get(String(variant._id)) || null;
      return {
        ...variant,
        inventory,
        availability: buildAvailability(inventory ? [inventory] : []),
        effectiveCare: resolveEffectiveCare(inventory, variant, doc),
        effectiveReturnPolicy: resolveEffectiveReturnPolicy(inventory, variant, doc),
      };
    });

    const priceRange = buildPriceRange(variants);
    const available = buildAvailability(inventoryDocs);
    const colorSummary = buildColorSummary(variants);

    res.json({
      ...doc,
      variants: variantsWithInventory,
      priceRange,
      availability: available,
      colorSummary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch product" });
  }
}

export async function update(req, res) {
  try {
    const patch = {};
    const body = req.body || {};

    if (hasOwn(body, "title")) patch.title = normalizeString(body.title);
    if (hasOwn(body, "slug")) patch.slug = slugify(body.slug);
    if (hasOwn(body, "description")) patch.description = normalizeString(body.description);
    if (hasOwn(body, "shortDescription")) patch.shortDescription = normalizeString(body.shortDescription);

    if (hasOwn(body, "primaryCategoryId")) patch.primaryCategoryId = new mongoose.Types.ObjectId(body.primaryCategoryId);
    if (hasOwn(body, "categoryIds")) patch.categoryIds = (body.categoryIds || []).map((id) => new mongoose.Types.ObjectId(id));

    if (hasOwn(body, "tags")) patch.tags = normalizeStringArray(body.tags);
    if (hasOwn(body, "currency")) patch.currency = normalizeString(body.currency || "INR", "INR");
    if (hasOwn(body, "images")) patch.images = Array.isArray(body.images) ? body.images : [];
    if (hasOwn(body, "materialProfile")) patch.materialProfile = normalizeMaterialProfile(body.materialProfile);
    if (hasOwn(body, "occasionTags")) patch.occasionTags = normalizeStringArray(body.occasionTags);
    if (hasOwn(body, "blouseDefault")) patch.blouseDefault = normalizeBlouseDefault(body.blouseDefault);
    if (hasOwn(body, "careDefault")) patch.careDefault = normalizeCarePolicy(body.careDefault);
    if (hasOwn(body, "returnPolicyDefault")) patch.returnPolicyDefault = normalizeReturnPolicy(body.returnPolicyDefault);
    if (hasOwn(body, "attributes")) patch.attributes = body.attributes && typeof body.attributes === "object" ? body.attributes : {};

    if (hasOwn(body, "isActive")) patch.isActive = !!body.isActive;
    if (hasOwn(body, "isFeatured")) patch.isFeatured = !!body.isFeatured;
    if (hasOwn(body, "sortOrder")) patch.sortOrder = asNumber(body.sortOrder, 0);
    if (hasOwn(body, "seoTitle")) patch.seoTitle = normalizeString(body.seoTitle);
    if (hasOwn(body, "seoDescription")) patch.seoDescription = normalizeString(body.seoDescription);

    patch.updatedBy = req.user?._id || null;

    const doc = await Product.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "Product slug already exists" });
    res.status(500).json({ error: err.message || "Failed to update product" });
  }
}

export async function softDelete(req, res) {
  try {
    const doc = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedBy: req.user?._id || null },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true, product: doc });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete product" });
  }
}

export async function publish(req, res) {
  try {
    const { isActive } = req.body;
    const doc = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: !!isActive, updatedBy: req.user?._id || null },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to publish/unpublish" });
  }
}

async function listProducts(query) {
  const {
    q,
    category,
    categoryId,
    isActive,
    availability,
    minPrice,
    maxPrice,
    page = 1,
    limit = 20,
  } = query;

  const match = {};
  if (isActive === "all") {
    // keep all statuses for admin list
  } else if (isActive === undefined) {
    match.isActive = true;
  } else {
    match.isActive = isActive === "true";
  }

  const resolvedCategory = categoryId || category;
  if (resolvedCategory) {
    if (!mongoose.isValidObjectId(resolvedCategory)) {
      throw new Error("categoryId must be a valid ObjectId");
    }
    match.categoryIds = new mongoose.Types.ObjectId(resolvedCategory);
  }

  const pipeline = [{ $match: match }];

  if (q && String(q).trim()) {
    pipeline.push({
      $match: {
        $text: { $search: String(q).trim() },
      },
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: "product_variants",
        let: { productId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$productId", "$$productId"] },
                  { $eq: ["$isActive", true] },
                ],
              },
            },
          },
          {
            $project: {
              price: 1,
              isDefault: 1,
              createdAt: 1,
              sortOrder: 1,
              merchandise: { color: 1 },
            },
          },
        ],
        as: "variants",
      },
    },
    {
      $lookup: {
        from: "inventory",
        let: { variantIds: "$variants._id" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$variantId", "$$variantIds"] },
            },
          },
          { $project: { availableQty: 1, allowBackorder: 1 } },
        ],
        as: "inventory",
      },
    },
    {
      $addFields: {
        minPrice: { $min: "$variants.price" },
        maxPrice: { $max: "$variants.price" },
        availability: {
          $anyElementTrue: {
            $map: {
              input: "$inventory",
              as: "inv",
              in: {
                $or: [
                  { $gt: ["$$inv.availableQty", 0] },
                  "$$inv.allowBackorder",
                ],
              },
            },
          },
        },
      },
    }
  );

  const priceConditions = [];
  if (minPrice !== undefined) {
    const min = Number(minPrice);
    if (!Number.isNaN(min)) {
      priceConditions.push({ $gte: ["$maxPrice", min] });
    }
  }
  if (maxPrice !== undefined) {
    const max = Number(maxPrice);
    if (!Number.isNaN(max)) {
      priceConditions.push({ $lte: ["$minPrice", max] });
    }
  }

  if (priceConditions.length) {
    pipeline.push({ $match: { $expr: { $and: priceConditions } } });
  }

  if (availability) {
    const normalized = String(availability).toLowerCase();
    if (["in_stock", "available", "true"].includes(normalized)) {
      pipeline.push({ $match: { availability: true } });
    }
    if (["out_of_stock", "false"].includes(normalized)) {
      pipeline.push({ $match: { availability: false } });
    }
  }

  pipeline.push(
    { $sort: { sortOrder: 1, createdAt: -1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) },
    {
      $project: {
        title: 1,
        slug: 1,
        description: 1,
        shortDescription: 1,
        primaryCategoryId: 1,
        categoryIds: 1,
        tags: 1,
        currency: 1,
        images: 1,
        materialProfile: 1,
        occasionTags: 1,
        blouseDefault: 1,
        careDefault: 1,
        returnPolicyDefault: 1,
        attributes: 1,
        isActive: 1,
        isFeatured: 1,
        sortOrder: 1,
        seoTitle: 1,
        seoDescription: 1,
        createdAt: 1,
        updatedAt: 1,
        minPrice: 1,
        maxPrice: 1,
        availability: 1,
        variants: 1,
      },
    }
  );

  const docs = await Product.aggregate(pipeline);

  return docs.map((doc) => {
    const colorSummary = buildColorSummary(doc.variants || []);
    const { variants, ...rest } = doc;
    return {
      ...rest,
      colorSummary,
    };
  });
}
