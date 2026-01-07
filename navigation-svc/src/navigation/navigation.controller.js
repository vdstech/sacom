import * as svc from "./navigation.service.js";

// STORE
export async function storeGetNavigation(req, res) {
  const tree = await svc.getStoreNavigationTree();
  return res.json({ tree });
}

// ADMIN
export async function adminList(req, res) {
  const items = await svc.adminList();
  return res.json({ items });
}

export async function adminCreate(req, res) {
  const doc = await svc.adminCreate(req.body);
  return res.status(201).json(doc);
}

export async function adminUpdate(req, res) {
  const doc = await svc.adminUpdate(req.params.id, req.body);
  if (!doc) return res.status(404).json({ error: "Nav item not found" });
  return res.json(doc);
}

export async function adminDelete(req, res) {
  try {
    const doc = await svc.adminDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Nav item not found" });
    return res.json({ deleted: true });
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
}

export async function adminReorderChildren(req, res) {
  const result = await svc.adminReorderChildren(req.body);
  return res.json(result);
}