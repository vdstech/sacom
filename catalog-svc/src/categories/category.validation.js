import mongoose from "mongoose";

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidParent(v) {
  if (v === undefined || v === null || v === "") return true;
  return typeof v === "string" && mongoose.Types.ObjectId.isValid(v);
}

export function validateCreate(req, res, next) {
  const { name, slug, parent } = req.body;

  if (!isNonEmptyString(name)) {
    return res.status(400).json({ error: "name is required" });
  }
  if (slug !== undefined && !isNonEmptyString(slug)) {
    return res.status(400).json({ error: "slug must be a non-empty string if provided" });
  }
  if (!isValidParent(parent)) {
    return res.status(400).json({ error: "parent must be a valid category id if provided" });
  }
  next();
}

export function validateUpdate(req, res, next) {
  const { name, slug, parent } = req.body;

  if (name !== undefined && !isNonEmptyString(name)) {
    return res.status(400).json({ error: "name must be a non-empty string if provided" });
  }
  if (slug !== undefined && !isNonEmptyString(slug)) {
    return res.status(400).json({ error: "slug must be a non-empty string if provided" });
  }
  if (!isValidParent(parent)) {
    return res.status(400).json({ error: "parent must be a valid category id if provided" });
  }
  next();
}
