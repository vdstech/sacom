import mongoose from "mongoose";
import CustomerWishlist from "./customer-wishlist.model.js";
import { buildWishlistProducts } from "./customer-wishlist.service.js";

export async function listWishlist(req, res) {
  const rows = await CustomerWishlist.find({ customer: req.customerAuth.customerId })
    .sort({ createdAt: -1 })
    .lean();
  const items = await buildWishlistProducts(rows.map((row) => row.productId));
  return res.json({ items });
}

export async function addWishlistItem(req, res) {
  const productId = String(req.body?.productId || "").trim();
  if (!mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ error: "productId must be a valid ObjectId" });
  }

  await CustomerWishlist.updateOne(
    { customer: req.customerAuth.customerId, productId },
    { $setOnInsert: { customer: req.customerAuth.customerId, productId } },
    { upsert: true }
  );

  const items = await CustomerWishlist.find({ customer: req.customerAuth.customerId }).sort({ createdAt: -1 }).lean();
  const payload = await buildWishlistProducts(items.map((row) => row.productId));
  return res.status(201).json({ items: payload });
}

export async function removeWishlistItem(req, res) {
  const productId = String(req.params.productId || "").trim();
  if (!mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ error: "productId must be a valid ObjectId" });
  }

  await CustomerWishlist.deleteOne({ customer: req.customerAuth.customerId, productId });
  return res.json({ success: true });
}
