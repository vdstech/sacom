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

export async function create(req, res) {
  try {
    const body = req.body;

    const doc = await Product.create({
      title: String(body.title).trim(),
      slug: body.slug ? slugify(body.slug) : slugify(body.title),
      description: body.description || "",
      shortDescription: body.shortDescription || "",
      primaryCategoryId: new mongoose.Types.ObjectId(body.primaryCategoryId),
      categoryIds: (body.categoryIds && body.categoryIds.length)
        ? body.categoryIds.map((id) => new mongoose.Types.ObjectId(id))
        : [new mongoose.Types.ObjectId(body.primaryCategoryId)],
      tags: body.tags || [],
      currency: body.currency || "INR",
      images: body.images || [],
      attributes: body.attributes || {},
      isActive: body.isActive !== undefined ? !!body.isActive : true,
      isFeatured: !!body.isFeatured,
      sortOrder: body.sortOrder || 0,
      seoTitle: body.seoTitle || "",
      seoDescription: body.seoDescription || "",
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
      .sort({ isDefault: -1, createdAt: -1 })
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
      };
    });

    const priceRange = buildPriceRange(variants);
    const available = buildAvailability(inventoryDocs);

    res.json({
      ...doc,
      variants: variantsWithInventory,
      priceRange,
      availability: available,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch product" });
  }
}

export async function update(req, res) {
  try {
    const patch = { ...req.body };
    if (patch.title) patch.title = String(patch.title).trim();
    if (patch.slug) patch.slug = slugify(patch.slug);

    if (patch.primaryCategoryId) patch.primaryCategoryId = new mongoose.Types.ObjectId(patch.primaryCategoryId);
    if (patch.categoryIds) patch.categoryIds = patch.categoryIds.map((id) => new mongoose.Types.ObjectId(id));

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
  if (isActive === undefined) {
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
          { $project: { price: 1 } },
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
      },
    }
  );

  return Product.aggregate(pipeline);
}
