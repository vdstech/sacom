import mongoose from "mongoose";

export function validateCreate(req, res, next) {
  const { sku, price } = req.body;
  const productId = req.params.id;

  if (!productId || !mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ error: "productId param is required" });
  }

  if (!sku || !String(sku).trim()) {
    return res.status(400).json({ error: "sku is required" });
  }

  if (price === undefined || Number.isNaN(Number(price))) {
    return res.status(400).json({ error: "price is required and must be a number" });
  }

  next();
}
