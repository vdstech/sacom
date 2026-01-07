import NavItem from "./navigation.model.js";
import Category from "./category.model.js";

// IMPORTANT: match your frontend category route
const CATEGORY_PREFIX = "/c"; // or "/collections"

async function enrichEffectivePaths(items) {
  const catIds = items.filter((x) => x.categoryId).map((x) => x.categoryId);

  let catMap = new Map();
  if (catIds.length) {
    const cats = await Category.find({ _id: { $in: catIds } })
      .select("_id name slug path")
      .lean();
    catMap = new Map(cats.map((c) => [String(c._id), c]));
  }

  return items.map((x) => {
    if (x.categoryId) {
      const c = catMap.get(String(x.categoryId)) || null;
      const effectivePath = c?.path ? `${CATEGORY_PREFIX}/${c.path}` : (x.path || "");
      return { ...x, category: c, effectivePath };
    }
    return { ...x, category: null, effectivePath: x.path || "" };
  });
}

/**
 * Build tree using parent's children[] as the source of truth for ordering.
 * Fallback: if parent.children[] missing, it will include children found by parentId.
 */
function buildTree(items) {
  const byId = new Map(items.map((x) => [String(x._id), { ...x, children: [] }]));

  // Group children by parentId (fallback)
  const childrenByParent = new Map();
  for (const x of items) {
    const p = x.parentId ? String(x.parentId) : "ROOT";
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p).push(String(x._id));
  }

  // Attach children in correct order
  for (const x of items) {
    const parent = byId.get(String(x._id));
    if (!parent) continue;

    const ordered = (x.children || []).map(String);
    const fallback = childrenByParent.get(String(x._id)) || [];

    const finalOrder = ordered.length ? ordered : fallback;

    for (const cid of finalOrder) {
      const child = byId.get(cid);
      if (child && String(child.parentId || "") === String(parent._id)) {
        parent.children.push(child);
      }
    }

    // add any missing kids (data mismatch safety)
    for (const cid of fallback) {
      if (!parent.children.find((c) => String(c._id) === cid)) {
        const child = byId.get(cid);
        if (child) parent.children.push(child);
      }
    }
  }

  // Roots (keep insertion order)
  const roots = [];
  for (const x of items) {
    if (!x.parentId) {
      const n = byId.get(String(x._id));
      if (n) roots.push(n);
    }
  }

  return roots;
}

// STORE
export async function getStoreNavigationTree() {
  const items = await NavItem.find({}).lean();
  const enriched = await enrichEffectivePaths(items);
  return buildTree(enriched);
}

// ADMIN CRUD
export async function adminList() {
  return NavItem.find({}).lean();
}

export async function adminCreate(payload) {
  const doc = await NavItem.create(payload);

  // If it has a parent, append into parent's children[] (end)
  if (doc.parentId) {
    await NavItem.updateOne({ _id: doc.parentId }, { $addToSet: { children: doc._id } });
  }

  return doc;
}

export async function adminUpdate(id, payload) {
  const before = await NavItem.findById(id).select("_id parentId").lean();
  const doc = await NavItem.findByIdAndUpdate(id, payload, { new: true });
  if (!doc) return null;

  const oldParent = before?.parentId ? String(before.parentId) : null;
  const newParent = doc.parentId ? String(doc.parentId) : null;

  // If parent changed, maintain children[] arrays
  if (oldParent !== newParent) {
    if (oldParent) await NavItem.updateOne({ _id: oldParent }, { $pull: { children: doc._id } });
    if (newParent) await NavItem.updateOne({ _id: newParent }, { $addToSet: { children: doc._id } });
  }

  return doc;
}

export async function adminDelete(id) {
  const hasChild = await NavItem.exists({ parentId: id });
  if (hasChild) throw new Error("Cannot delete: item has children");

  const doc = await NavItem.findById(id).select("_id parentId").lean();
  if (doc?.parentId) {
    await NavItem.updateOne({ _id: doc.parentId }, { $pull: { children: doc._id } });
  }

  return NavItem.findByIdAndDelete(id);
}

/**
 * ✅ Reorder within a parent:
 * Sarees -> [Cotton, Fancy]
 * Only updates parent.children[]
 */
export async function adminReorderChildren({ parentId, children }) {
  // Ensure each child belongs to this parent (safety)
  const docs = await NavItem.find({ _id: { $in: children } }).select("_id parentId").lean();

  for (const d of docs) {
    if (String(d.parentId || "") !== String(parentId)) {
      throw new Error("Reorder invalid: child does not belong to this parent");
    }
  }

  await NavItem.updateOne({ _id: parentId }, { $set: { children } });

  return { ok: true };
}
