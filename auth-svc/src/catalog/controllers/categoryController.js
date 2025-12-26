const Category = require("../models/categoryModel.js");
const slugify = require("../../utils/slugify.js");
const buildTree = require("../../utils/buildTree.js");

exports.list = async (req, res) => {
  const { parentId = undefined, isActive = undefined } = req.query;

  const filter = {};
  if (parentId !== undefined) filter.parentId = parentId === "null" ? null : parentId;
  if (isActive !== undefined) filter.isActive = isActive === "true";

  const items = await Category.find(filter).sort({ parentId: 1, sortOrder: 1, name: 1 }).lean();
  return res.json({ items });
};

exports.tree = async (req, res) => {
  const items = await Category.find({}).sort({ parentId: 1, sortOrder: 1, name: 1 }).lean();
  return res.json({ items: buildTree(items) });
};

exports.getById = async (req, res) => {
  const item = await Category.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ error: "Category not found" });
  return res.json({ item });
};

exports.create = async (req, res) => {
  const { name, slug, parentId = null, isActive = true, description = "" } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  await validateParent({ parentId });

  const finalSlug = slugify(slug || name);
  const sortOrder = await getNextSortOrder(parentId); // ✅ server decides

  try {
    const created = await Category.create({
      name,
      slug: finalSlug,
      parentId,
      sortOrder,
      isActive,
      description,
    });
    return res.status(201).json({ item: created });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: "Slug already exists under this parent" });
    throw e;
  }
};

async function validateParent({ res, categoryId = null, parentId }) {
  // root is allowed

  console.log("Validating parentId:", parentId, "for categoryId:", categoryId);
  if (parentId === null || parentId === undefined) return;

  // cannot be its own parent
  if (categoryId && String(categoryId) === String(parentId)) {
    return res.status(400).json({ error: "Category cannot be its own parent" });
  }

  // parent must exist
  const parent = await Category.findById(parentId).select({ _id: 1, parentId: 1 }).lean();
  if (!parent) {
    return res.status(404).json({ error: "Parent Category not found" });
  }

  // prevent cycles: walk up from parent -> root, ensure we never hit categoryId
  if (categoryId) {
    let cur = parent;
    while (cur && cur.parentId) {
      if (String(cur.parentId) === String(categoryId)) {
        return res.status(404).json({ error: "Parent Category not found" });
      }
      cur = await Category.findById(cur.parentId).select({ _id: 1, parentId: 1 }).lean();
    }
  }
}

exports.update = async (req, res) => {
  const { name, slug, parentId, isActive, description } = req.body;

  const existing = await Category.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Category not found" });

  const update = {};
  if (name !== undefined) update.name = name;

  if (slug !== undefined || name !== undefined) {
    update.slug = slugify(slug || name);
  }

  if (isActive !== undefined) update.isActive = isActive;
  if (description !== undefined) update.description = description;

  // ✅ If parent changes, put it at end of new parent's order
  if (parentId !== undefined && String(parentId || null) !== String(existing.parentId || null)) {

    await validateParent({ res, categoryId: existing._id, parentId });
 
    
    update.parentId = parentId;
    update.sortOrder = await getNextSortOrder(parentId);
  }

  // ❌ ignore req.body.sortOrder entirely

  try {
    const item = await Category.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    return res.json({ item });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: "Slug already exists under this parent" });
    throw e;
  }
};

exports.publish = async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "isActive must be boolean" });
  }

  const item = await Category.findByIdAndUpdate(
    req.params.id,
    { isActive },
    { new: true }
  );

  if (!item) return res.status(404).json({ error: "Category not found" });
  return res.json({ item });
};

// Reorder categories within a parent
// body: { parentId: null|<id>, orderedIds: ["id1","id2",...] }
// body: { parentId: null|<id>, orderedIds: [...] }
// PATCH /api/categories/reorder
// body: { parentId: null|"<id>", orderedSlugs: ["men","women","kids"] }

exports.reorder = async (req, res) => {
  const { parentId = null, orderedIds } = req.body;

  // Normalize parentId:
  // - UI might send "null" string; convert to actual null
  const normParentId = (parentId === "null" || parentId === undefined) ? null : parentId;

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "orderedIds must be an array" });
  }

  // Fetch ALL children under this parent (or root if parentId=null)
  const siblings = await Category.find({ parentId: normParentId })
    .select({ _id: 1 })
    .lean();

  // If there are no children, enforce empty reorder payload
  if (siblings.length === 0) {
    if (orderedIds.length !== 0) {
      return res.status(400).json({ error: "No children under this parent to reorder" });
    }
    return res.json({ ok: true });
  }

  // If there are children, reorder must include ALL of them
  if (orderedIds.length !== siblings.length) {
    return res.status(400).json({
      error: "orderedIds must include all children under this parentId",
      expectedCount: siblings.length,
      receivedCount: orderedIds.length,
    });
  }

  // no duplicates
  const uniq = new Set(orderedIds.map(String));
  if (uniq.size !== orderedIds.length) {
    return res.status(400).json({ error: "orderedIds contains duplicates" });
  }

  // ensure payload contains ONLY these siblings
  const siblingSet = new Set(siblings.map((s) => String(s._id)));
  const bad = orderedIds.some((id) => !siblingSet.has(String(id)));
  if (bad) {
    return res.status(400).json({ error: "orderedIds contains ids not belonging to this parentId" });
  }

  // apply order (0..n-1)
  const bulk = orderedIds.map((id, idx) => ({
    updateOne: { filter: { _id: id }, update: { $set: { sortOrder: idx } } },
  }));

  await Category.bulkWrite(bulk);
  return res.json({ ok: true });
};

exports.remove = async (req, res) => {
  const id = req.params.id;

  // block delete if has children
  const childCount = await Category.countDocuments({ parentId: id });
  if (childCount > 0) {
    return res.status(409).json({ error: "Category has child categories. Delete/move children first." });
  }

  const deleted = await Category.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: "Category not found" });

  return res.json({ ok: true });
};

async function getNextSortOrder(parentId) {
  const last = await Category.findOne({ parentId: parentId ?? null })
    .sort({ sortOrder: -1 })
    .select({ sortOrder: 1 })
    .lean();

  const lastOrder = typeof last?.sortOrder === "number" ? last.sortOrder : -1;
  return lastOrder + 1; // starts at 0
}
