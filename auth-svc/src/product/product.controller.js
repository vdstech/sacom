import mongoose from "mongoose";
import Product from "./product.model.js";

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
        ? body.categoryIds.map(id => new mongoose.Types.ObjectId(id))
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
    const { q, categoryId, isActive, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (categoryId) filter.categoryIds = new mongoose.Types.ObjectId(categoryId);

    let query = Product.find(filter).lean();

    if (q && String(q).trim()) {
      query = Product.find(
        { ...filter, $text: { $search: String(q).trim() } },
        { score: { $meta: "textScore" } }
      ).sort({ score: { $meta: "textScore" } }).lean();
    } else {
      query = query.sort({ sortOrder: 1, createdAt: -1 });
    }

    const skip = (Number(page) - 1) * Number(limit);
    const docs = await query.skip(skip).limit(Number(limit));
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to list products" });
  }
}

export async function getById(req, res) {
  try {
    const doc = await Product.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch product" });
  }
}

export async function getBySlug(req, res) {
  try {
    const doc = await Product.findOne({ slug: String(req.params.slug).toLowerCase() }).lean();
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json(doc);
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
    if (patch.categoryIds) patch.categoryIds = patch.categoryIds.map(id => new mongoose.Types.ObjectId(id));

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
