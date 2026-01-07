const mongoose = require("mongoose");

const InventorySchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", required: true },

    trackInventory: { type: Boolean, default: true },
    availableQty: { type: Number, default: 0, min: 0 },
    reservedQty: { type: Number, default: 0, min: 0 },

    allowBackorder: { type: Boolean, default: false },
    reorderLevel: { type: Number, default: 0, min: 0 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

InventorySchema.index({ sku: 1 }, { unique: true });
InventorySchema.index({ productId: 1 });
InventorySchema.index({ variantId: 1 });

module.exports = mongoose.model("Inventory", InventorySchema, "inventory");