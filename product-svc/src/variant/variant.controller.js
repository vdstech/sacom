import mongoose from "mongoose";
import Product from "../product/product.model.js";
import Variant from "./variant.model.js";
import Inventory from "../inventory/inventory.model.js";

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

function normalizeMerchandise(input = {}) {
  return {
    color: {
      name: normalizeString(input?.color?.name),
      family: normalizeString(input?.color?.family),
      hex: normalizeString(input?.color?.hex),
    },
    size: {
      label: normalizeString(input?.size?.label),
      system: normalizeString(input?.size?.system),
      sortKey: asNumber(input?.size?.sortKey, 0),
    },
    blouse: {
      included: !!input?.blouse?.included,
      type: normalizeString(input?.blouse?.type),
      lengthMeters: Math.max(0, asNumber(input?.blouse?.lengthMeters, 0)),
    },
    saree: {
      lengthMeters: Math.max(0, asNumber(input?.saree?.lengthMeters, 0)),
      widthMeters: Math.max(0, asNumber(input?.saree?.widthMeters, 0)),
      weightGrams: Math.max(0, asNumber(input?.saree?.weightGrams, 0)),
      fallPicoDone: !!input?.saree?.fallPicoDone,
      stitchReady: !!input?.saree?.stitchReady,
    },
    style: {
      occasionTags: normalizeStringArray(input?.style?.occasionTags),
      workType: normalizeString(input?.style?.workType),
      pattern: normalizeString(input?.style?.pattern),
    },
    careOverride: input?.careOverride ? normalizeCarePolicy(input.careOverride) : null,
    returnPolicyOverride: input?.returnPolicyOverride ? normalizeReturnPolicy(input.returnPolicyOverride) : null,
  };
}

function resolveEffectiveCare(inventoryDoc, variantDoc, productDoc) {
  if (inventoryDoc?.care) return inventoryDoc.care;
  if (variantDoc?.merchandise?.careOverride) return variantDoc.merchandise.careOverride;
  return productDoc?.careDefault || null;
}

function resolveEffectiveReturnPolicy(inventoryDoc, variantDoc, productDoc) {
  if (inventoryDoc?.returnPolicy) return inventoryDoc.returnPolicy;
  if (variantDoc?.merchandise?.returnPolicyOverride) return variantDoc.merchandise.returnPolicyOverride;
  return productDoc?.returnPolicyDefault || null;
}

function normalizeInventorySnapshot(input = {}, variantPayload = null) {
  return {
    trackInventory: input.trackInventory !== undefined ? !!input.trackInventory : true,
    availableQty: Math.max(0, asNumber(input.availableQty, 0)),
    reservedQty: Math.max(0, asNumber(input.reservedQty, 0)),
    allowBackorder: !!input.allowBackorder,
    reorderLevel: Math.max(0, asNumber(input.reorderLevel, 0)),
    display: {
      colorName: normalizeString(input?.display?.colorName || variantPayload?.merchandise?.color?.name),
      sizeLabel: normalizeString(input?.display?.sizeLabel || variantPayload?.merchandise?.size?.label),
      materialLabel: normalizeString(input?.display?.materialLabel),
    },
    care: normalizeCarePolicy(input.care),
    returnPolicy: normalizeReturnPolicy(input.returnPolicy),
    fulfillment: {
      warehouseCode: normalizeString(input?.fulfillment?.warehouseCode),
      binLocation: normalizeString(input?.fulfillment?.binLocation),
      restockEtaDays: Math.max(0, asNumber(input?.fulfillment?.restockEtaDays, 0)),
    },
  };
}

export async function createForProduct(req, res) {
  try {
    const productId = new mongoose.Types.ObjectId(req.params.id);
    const b = req.body;

    const merchandise = normalizeMerchandise(b.merchandise || {});

    const doc = await Variant.create({
      productId,
      sku: String(b.sku).trim().toUpperCase(),
      price: Number(b.price),
      mrp: Number(b.mrp || 0),
      compareAtPrice: Number(b.compareAtPrice || 0),
      barcode: b.barcode || "",
      weightKg: Number(b.weightKg || 0),
      dimensionsCm: b.dimensionsCm || { l: 0, w: 0, h: 0 },
      images: Array.isArray(b.images) ? b.images : [],
      merchandise,
      isDefault: !!b.isDefault,
      isActive: b.isActive !== undefined ? !!b.isActive : true,
      sortOrder: asNumber(b.sortOrder, 0),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    let inventoryDoc = null;
    if (b.inventory) {
      const snapshot = normalizeInventorySnapshot(b.inventory, { merchandise });
      inventoryDoc = await Inventory.findOneAndUpdate(
        { sku: doc.sku },
        {
          $set: {
            sku: doc.sku,
            productId,
            variantId: doc._id,
            ...snapshot,
            updatedBy: req.user?._id || null,
          },
        },
        { new: true, upsert: true, runValidators: true }
      );
    }

    res.status(201).json({ variant: doc, inventory: inventoryDoc });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "SKU already exists" });
    res.status(500).json({ error: err.message || "Failed to create variant" });
  }
}

export async function listForProduct(req, res) {
  try {
    const productId = req.params.id;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "productId param is required" });
    }

    const [variants, productDoc] = await Promise.all([
      Variant.find({ productId })
        .sort({ isDefault: -1, sortOrder: 1, createdAt: 1 })
        .lean(),
      Product.findById(productId).lean(),
    ]);

    const variantIds = variants.map((variant) => variant._id);
    const inventories = variantIds.length
      ? await Inventory.find({ variantId: { $in: variantIds } }).lean()
      : [];

    const inventoryByVariant = new Map(
      inventories.map((inventory) => [String(inventory.variantId), inventory])
    );

    return res.json(
      variants.map((variant) => {
        const inventory = inventoryByVariant.get(String(variant._id)) || null;
        return {
          ...variant,
          inventory,
          effectiveCare: resolveEffectiveCare(inventory, variant, productDoc),
          effectiveReturnPolicy: resolveEffectiveReturnPolicy(inventory, variant, productDoc),
        };
      })
    );
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list variants" });
  }
}

export async function updateVariant(req, res) {
  try {
    const variantId = req.params.variantId;
    if (!mongoose.isValidObjectId(variantId)) {
      return res.status(400).json({ error: "variantId must be a valid ObjectId" });
    }

    const patch = { ...req.body };
    if (patch.sku) patch.sku = String(patch.sku).trim().toUpperCase();
    if (patch.price !== undefined) patch.price = Number(patch.price);
    if (patch.mrp !== undefined) patch.mrp = Number(patch.mrp);
    if (patch.compareAtPrice !== undefined) patch.compareAtPrice = Number(patch.compareAtPrice);
    if (patch.weightKg !== undefined) patch.weightKg = Number(patch.weightKg);
    if (patch.sortOrder !== undefined) patch.sortOrder = asNumber(patch.sortOrder, 0);
    if (patch.merchandise) patch.merchandise = normalizeMerchandise(patch.merchandise);
    patch.updatedBy = req.user?._id || null;

    const variant = await Variant.findByIdAndUpdate(variantId, patch, {
      new: true,
      runValidators: true,
    });
    if (!variant) return res.status(404).json({ error: "Variant not found" });

    if (patch.inventory) {
      const snapshot = normalizeInventorySnapshot(patch.inventory, variant);
      await Inventory.findOneAndUpdate(
        { variantId: variant._id },
        {
          $set: {
            sku: variant.sku,
            productId: variant.productId,
            variantId: variant._id,
            ...snapshot,
            updatedBy: req.user?._id || null,
          },
        },
        { new: true, upsert: true, runValidators: true }
      );
    }

    return res.json(variant);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "SKU already exists" });
    return res.status(500).json({ error: err.message || "Failed to update variant" });
  }
}
