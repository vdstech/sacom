const mongoose = require("mongoose");

exports.validateUpsert = (req, res, next) => {
  const { sku, productId, variantId } = req.body;
  if (!sku) return res.status(400).json({ error: "sku is required" });
  if (!productId || !mongoose.isValidObjectId(productId)) return res.status(400).json({ error: "productId is required" });
  if (!variantId || !mongoose.isValidObjectId(variantId)) return res.status(400).json({ error: "variantId is required" });
  next();
};

exports.validateAdjust = (req, res, next) => {
  const { sku, delta } = req.body;
  if (!sku) return res.status(400).json({ error: "sku is required" });
  if (delta === undefined || !Number.isInteger(Number(delta))) {
    return res.status(400).json({ error: "delta is required and must be an integer (can be negative)" });
  }
  next();
};