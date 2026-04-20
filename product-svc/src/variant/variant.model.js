import mongoose from "mongoose";

const VariantColorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    hex: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const VariantStockSchema = new mongoose.Schema(
  {
    stockKey: { type: String, required: true, trim: true, uppercase: true },
    sizeLabel: { type: String, default: "", trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const VariantSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    price: { type: Number, required: true, min: 0 },
    discount: {
      type: {
        type: String,
        enum: ["none", "percent", "flat"],
        default: "none",
      },
      value: { type: Number, default: 0, min: 0 },
      label: { type: String, default: "" },
    },
    images: [
      {
        url: { type: String, required: true },
        alt: { type: String, default: "" },
        sortOrder: { type: Number, default: 0 },
      },
    ],
    colors: { type: [VariantColorSchema], default: [] },
    sizeLabel: { type: String, default: "", trim: true },
    stock: { type: [VariantStockSchema], default: [] },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

VariantSchema.index({ productId: 1, isActive: 1 });
VariantSchema.index({ productId: 1, isDefault: 1, createdAt: 1 });
VariantSchema.index({ productId: 1, "colors.name": 1, isActive: 1 });
VariantSchema.index({ productId: 1, sizeLabel: 1, isActive: 1 });
VariantSchema.index({ "stock.stockKey": 1 }, { sparse: true });

VariantSchema.pre("validate", function (next) {
  const rawColors = Array.isArray(this.colors) ? this.colors : [];
  const legacyColor = this.color ? [this.color] : [];
  const seenColors = new Set();
  this.colors = [...rawColors, ...legacyColor]
    .map((entry) => {
      const name = String(entry?.name || "").trim();
      if (!name) return null;
      const key = name.toLowerCase();
      if (seenColors.has(key)) return null;
      seenColors.add(key);
      const hex = String(entry?.hex || "").trim();
      return hex ? { name, hex } : { name };
    })
    .filter(Boolean);

  const normalizedSizeLabel = String(this.sizeLabel || "").trim();
  this.sizeLabel = normalizedSizeLabel;

  if (this.discount) {
    this.discount.label = String(this.discount.label || "").trim();
    if (this.discount.type === "none") this.discount.value = 0;
    if (this.discount.type === "percent" && this.discount.value > 100) {
      this.discount.value = 100;
    }
  }

  if (Array.isArray(this.stock)) {
    this.stock = this.stock.map((entry) => ({
      stockKey: String(entry?.stockKey || "").trim().toUpperCase(),
      sizeLabel: String(entry?.sizeLabel || "").trim(),
      quantity: Number.isFinite(Number(entry?.quantity)) ? Math.max(0, Number(entry.quantity)) : 0,
      reorderLevel: Number.isFinite(Number(entry?.reorderLevel)) ? Math.max(0, Number(entry.reorderLevel)) : 0,
    }));
  }

  if ((!this.sizeLabel || this.isModified?.("stock")) && Array.isArray(this.stock)) {
    const sizeLabels = this.stock
      .map((entry) => String(entry?.sizeLabel || "").trim())
      .filter(Boolean);
    this.sizeLabel = sizeLabels.length === 1 ? sizeLabels[0] : "";
  }

  next();
});

const Variant = mongoose.model("Variant", VariantSchema, "product_variants");

export async function syncVariantIndexes(logger = null) {
  try {
    await Variant.syncIndexes();
    if (logger?.info) logger.info("Variant indexes synced");
  } catch (err) {
    if (logger?.warn) {
      logger.warn({ err }, "Failed to sync variant indexes");
      return;
    }
    throw err;
  }
}

export default Variant;
