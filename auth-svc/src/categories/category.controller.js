import mongoose from "mongoose";
import Category from "./category.model.js";

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createCategory(req, res) {
  try {
    const {
      name,
      slug,
      description = "",
      parent = null,
      sortOrder = 0,
      isActive = true,
      imageUrl = "",
      seoTitle = "",
      seoDescription = "",
    } = req.body;

    const doc = await Category.create({
      name: name.trim(),
      slug: (slug ? slugify(slug) : slugify(name)),
      description,
      parent: parent ? new mongoose.Types.ObjectId(parent) : null,
      sortOrder,
      isActive,
      imageUrl,
      seoTitle,
      seoDescription,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    return res.status(201).json(doc);
  } catch (err) {
    // Duplicate key (same parent+slug)
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Category slug already exists under this parent" });
    }
    return res.status(500).json({ error: err.message || "Failed to create category" });
  }
}

export async function listCategories(req, res) {
  try {
    const { parent = undefined, isActive = undefined } = req.query;

    const filter = {};
    if (parent !== undefined) filter.parent = parent ? new mongoose.Types.ObjectId(parent) : null;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const docs = await Category.find(filter)
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return res.json(docs);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list categories" });
  }
}

export async function getCategoryById(req, res) {
  try {
    const doc = await Category.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Category not found" });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to get category" });
  }
}

export async function getCategoryBySlug(req, res) {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    const doc = await Category.findOne({ slug, parent: null }).lean(); // root slug lookup
    if (!doc) return res.status(404).json({ error: "Category not found" });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to get category" });
  }
}

// Builds tree for menus (fast for <= few thousand categories)
export async function getCategoryTree(req, res) {
  try {
    const docs = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const byId = new Map(docs.map(d => [String(d._id), { ...d, children: [] }]));
    const roots = [];

    for (const node of byId.values()) {
      if (node.parent) {
        const p = byId.get(String(node.parent));
        if (p) p.children.push(node);
        else roots.push(node); // fallback if parent missing
      } else {
        roots.push(node);
      }
    }

    return res.json(roots);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to build tree" });
  }
}

export async function updateCategory(req, res) {
  try {
    const id = req.params.id;

    const patch = { ...req.body };
    if (patch.name) patch.name = patch.name.trim();
    if (patch.slug) patch.slug = slugify(patch.slug);
    if (patch.parent === "") patch.parent = null;

    patch.updatedBy = req.user?._id || null;

    const doc = await Category.findById(id);
    if (!doc) return res.status(404).json({ error: "Category not found" });

    // Optional safety: block setting parent to itself
    if (patch.parent && String(patch.parent) === String(doc._id)) {
      return res.status(400).json({ error: "Category cannot be its own parent" });
    }

    Object.assign(doc, patch);
    await doc.save();

    return res.json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Category slug already exists under this parent" });
    }
    return res.status(500).json({ error: err.message || "Failed to update category" });
  }
}

export async function deleteCategory(req, res) {
  try {
    const id = req.params.id;

    const childrenCount = await Category.countDocuments({ parent: id });
    if (childrenCount > 0) {
      return res.status(409).json({ error: "Cannot delete category with children. Delete/move children first." });
    }

    // Soft delete is safer for ecommerce (recommended)
    const doc = await Category.findByIdAndUpdate(
      id,
      { isActive: false, updatedBy: req.user?._id || null },
      { new: true }
    );

    if (!doc) return res.status(404).json({ error: "Category not found" });
    return res.json({ success: true, category: doc });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete category" });
  }
}
