import mongoose from "mongoose";
import Inventory from "./inventory.model.js";

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export async function listInventory(req, res) {
  try {
    const {
      productId,
      variantId,
      sizeLabel,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (productId) {
      if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ error: "productId must be a valid ObjectId" });
      }
      filter.productId = productId;
    }
    if (variantId) {
      if (!mongoose.isValidObjectId(variantId)) {
        return res.status(400).json({ error: "variantId must be a valid ObjectId" });
      }
      filter.variantId = variantId;
    }
    if (sizeLabel) filter.sizeLabel = new RegExp(`^${String(sizeLabel).trim()}$`, "i");

    const docs = await Inventory.find(filter)
      .sort({ updatedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    return res.json(docs);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list stock" });
  }
}

export async function updateInventory(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Inventory id must be a valid ObjectId" });
    }

    const body = req.body || {};
    const patch = {
      updatedBy: req.user?._id || null,
    };

    if (body.quantity !== undefined) patch.quantity = Math.max(0, asNumber(body.quantity, 0));
    if (body.reorderLevel !== undefined) patch.reorderLevel = Math.max(0, asNumber(body.reorderLevel, 0));
    if (body.sizeLabel !== undefined) patch.sizeLabel = normalizeString(body.sizeLabel);

    const doc = await Inventory.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: "Inventory not found" });

    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update stock" });
  }
}
