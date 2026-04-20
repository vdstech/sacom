import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema(
  {
    stockKey: { type: String, required: true, trim: true, uppercase: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", required: true },
    sizeLabel: { type: String, default: "", trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

InventorySchema.index({ stockKey: 1 }, { unique: true });
InventorySchema.index({ productId: 1 });
InventorySchema.index({ variantId: 1 });

InventorySchema.pre("validate", function (next) {
  this.stockKey = String(this.stockKey || "").trim().toUpperCase();
  this.sizeLabel = String(this.sizeLabel || "").trim();
  next();
});

const Inventory = mongoose.model("Inventory", InventorySchema, "inventory");

export async function syncInventoryIndexes(logger = null) {
  try {
    await Inventory.syncIndexes();
    if (logger?.info) logger.info("Inventory indexes synced");
  } catch (err) {
    if (logger?.warn) {
      logger.warn({ err }, "Failed to sync inventory indexes");
      return;
    }
    throw err;
  }
}

export default Inventory;
