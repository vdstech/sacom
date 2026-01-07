const mongoose = require("mongoose");

exports.validateCreate = (req, res, next) => {
  const { productId, sku, price } = req.body;
  if (!productId || !mongoose.isValidObjectId(productId)) return res.status(400).json({ error: "productId is required" });
  if (!sku || !String(sku).trim()) return res.status(400).json({ error: "sku is required" });
  if (price === undefined || Number(price) < 0) return res.status(400).json({ error: "price is required and must be >= 0" });
  next();
};