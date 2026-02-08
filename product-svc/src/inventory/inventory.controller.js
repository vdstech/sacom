import mongoose from "mongoose";
import Inventory from "./inventory.model.js";

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeCarePolicy(input = {}) {
  return {
    washCare: normalizeStringArray(input.washCare),
    ironCare: normalizeString(input.ironCare),
    bleach: normalizeString(input.bleach),
    dryClean: normalizeString(input.dryClean),
    dryInstructions: normalizeString(input.dryInstructions),
  };
}

function normalizeReturnPolicy(input = {}) {
  const returnable = !!input.returnable;
  const windowDays = Math.max(0, asNumber(input.windowDays, 0));
  const normalized = {
    returnable,
    windowDays: returnable ? Math.max(1, windowDays) : 0,
    type: normalizeString(input.type || (returnable ? "exchange_or_refund" : "none"), returnable ? "exchange_or_refund" : "none"),
    notes: normalizeString(input.notes),
  };

  if (!returnable) normalized.type = "none";
  return normalized;
}

export async function listInventory(req, res) {
  try {
    const {
      productId,
      sku,
      colorName,
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
    if (sku) filter.sku = String(sku).trim().toUpperCase();
    if (colorName) filter["display.colorName"] = new RegExp(`^${String(colorName).trim()}$`, "i");
    if (sizeLabel) filter["display.sizeLabel"] = new RegExp(`^${String(sizeLabel).trim()}$`, "i");

    const docs = await Inventory.find(filter)
      .sort({ updatedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    return res.json(docs);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list inventory" });
  }
}

export async function updateInventory(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Inventory id must be a valid ObjectId" });
    }

    const body = req.body || {};
    const patch = {};

    if (body.availableQty !== undefined) patch.availableQty = Math.max(0, asNumber(body.availableQty, 0));
    if (body.reservedQty !== undefined) patch.reservedQty = Math.max(0, asNumber(body.reservedQty, 0));
    if (body.reorderLevel !== undefined) patch.reorderLevel = Math.max(0, asNumber(body.reorderLevel, 0));
    if (body.trackInventory !== undefined) patch.trackInventory = !!body.trackInventory;
    if (body.allowBackorder !== undefined) patch.allowBackorder = !!body.allowBackorder;

    if (body.display) {
      patch.display = {
        colorName: normalizeString(body.display.colorName),
        sizeLabel: normalizeString(body.display.sizeLabel),
        materialLabel: normalizeString(body.display.materialLabel),
      };
    }

    if (body.care) {
      patch.care = normalizeCarePolicy(body.care);
    }

    if (body.returnPolicy) {
      patch.returnPolicy = normalizeReturnPolicy(body.returnPolicy);
    }

    if (body.fulfillment) {
      patch.fulfillment = {
        warehouseCode: normalizeString(body.fulfillment.warehouseCode),
        binLocation: normalizeString(body.fulfillment.binLocation),
        restockEtaDays: Math.max(0, asNumber(body.fulfillment.restockEtaDays, 0)),
      };
    }

    patch.updatedBy = req.user?._id || null;

    const doc = await Inventory.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: "Inventory not found" });

    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update inventory" });
  }
}
