import mongoose from "mongoose";
import Variant from "./variant.model.js";
import Inventory from "../inventory/inventory.model.js";

export async function createForProduct(req, res) {
  try {
    const productId = new mongoose.Types.ObjectId(req.params.id);
    const b = req.body;

    const doc = await Variant.create({
      productId,
      sku: String(b.sku).trim().toUpperCase(),
      optionValues: b.optionValues || {},
      price: Number(b.price),
      mrp: Number(b.mrp || 0),
      compareAtPrice: Number(b.compareAtPrice || 0),
      barcode: b.barcode || "",
      weightKg: Number(b.weightKg || 0),
      dimensionsCm: b.dimensionsCm || { l: 0, w: 0, h: 0 },
      images: b.images || [],
      isDefault: !!b.isDefault,
      isActive: b.isActive !== undefined ? !!b.isActive : true,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    let inventoryDoc = null;
    if (b.inventory) {
      inventoryDoc = await Inventory.findOneAndUpdate(
        { sku: doc.sku },
        {
          $set: {
            sku: doc.sku,
            productId,
            variantId: doc._id,
            trackInventory: b.inventory.trackInventory !== undefined ? !!b.inventory.trackInventory : true,
            availableQty: Number(b.inventory.availableQty || 0),
            reservedQty: Number(b.inventory.reservedQty || 0),
            allowBackorder: !!b.inventory.allowBackorder,
            reorderLevel: Number(b.inventory.reorderLevel || 0),
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
