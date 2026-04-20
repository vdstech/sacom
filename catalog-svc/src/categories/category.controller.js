import mongoose from "mongoose";
import Category from "./category.model.js";
import { mergeFilterConfigs, normalizeFilterConfig } from "./filterConfig.js";

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const FILTER_CONFIG_CACHE_TTL_MS = Number(process.env.CATEGORY_FILTER_CONFIG_CACHE_MS || 30000);
const filterConfigCache = new Map();

function setCachedResolvedFilterConfig(categoryId, payload) {
  filterConfigCache.set(String(categoryId), {
    payload,
    expiresAt: Date.now() + FILTER_CONFIG_CACHE_TTL_MS,
  });
}

function getCachedResolvedFilterConfig(categoryId) {
  const entry = filterConfigCache.get(String(categoryId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    filterConfigCache.delete(String(categoryId));
    return null;
  }
  return entry.payload;
}

function clearFilterConfigCache() {
  filterConfigCache.clear();
}

async function resolveCategoryFilterConfig(categoryId) {
  const cached = getCachedResolvedFilterConfig(categoryId);
  if (cached) return cached;

  const category = await Category.findById(categoryId)
    .select("_id parent ancestors filterConfig")
    .lean();
  if (!category) return null;

  const chainIds = [...(category.ancestors || []), category._id];
  const docs = await Category.find({ _id: { $in: chainIds } })
    .select("_id filterConfig")
    .lean();
  const byId = new Map(docs.map((item) => [String(item._id), item]));
  const configs = [];
  for (const id of chainIds) {
    const entry = byId.get(String(id));
    if (!entry?.filterConfig) continue;
    configs.push(entry.filterConfig);
  }

  const resolved = mergeFilterConfigs(configs);
  const payload = {
    categoryId: String(category._id),
    ancestors: (category.ancestors || []).map((id) => String(id)),
    resolvedConfig: resolved,
  };

  setCachedResolvedFilterConfig(categoryId, payload);
  return payload;
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
      filterConfig = undefined,
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
      filterConfig: filterConfig ? normalizeFilterConfig(filterConfig) : normalizeFilterConfig({}),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    clearFilterConfigCache();

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
    if (Object.prototype.hasOwnProperty.call(patch, "filterConfig")) {
      patch.filterConfig = normalizeFilterConfig(patch.filterConfig || {});
    }

    patch.updatedBy = req.user?._id || null;

    const doc = await Category.findById(id);
    if (!doc) return res.status(404).json({ error: "Category not found" });

    // Optional safety: block setting parent to itself
    if (patch.parent && String(patch.parent) === String(doc._id)) {
      return res.status(400).json({ error: "Category cannot be its own parent" });
    }

    // Block parent loops: cannot move a category under its own descendant.
    if (patch.parent) {
      const proposedParent = await Category.findById(patch.parent).select("ancestors").lean();
      if (!proposedParent) {
        return res.status(400).json({ error: "Parent category not found" });
      }

      const ancestorIds = (proposedParent.ancestors || []).map((a) => String(a));
      if (ancestorIds.includes(String(doc._id))) {
        return res.status(400).json({ error: "Category cannot be moved under its own descendant" });
      }
    }

    Object.assign(doc, patch);
    await doc.save();
    clearFilterConfigCache();

    return res.json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Category slug already exists under this parent" });
    }
    return res.status(500).json({ error: err.message || "Failed to update category" });
  }
}

export async function getCategoryFilterConfig(req, res) {
  try {
    const payload = await resolveCategoryFilterConfig(req.params.id);
    if (!payload) return res.status(404).json({ error: "Category not found" });
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to resolve category filter config" });
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
    clearFilterConfigCache();
    return res.json({ success: true, category: doc });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete category" });
  }
}
