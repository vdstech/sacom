import mongoose from "mongoose";

export function validateCreate(req, res, next) {
  const { title, primaryCategoryId } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: "title is required" });
  if (!primaryCategoryId || !mongoose.isValidObjectId(primaryCategoryId)) {
    return res.status(400).json({ error: "primaryCategoryId is required and must be a valid ObjectId" });
  }
  next();
}

export function validateUpdate(req, res, next) {
  if (req.body.primaryCategoryId && !mongoose.isValidObjectId(req.body.primaryCategoryId)) {
    return res.status(400).json({ error: "primaryCategoryId must be a valid ObjectId" });
  }
  next();
}
