const mongoose = require("mongoose");

const VariantSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },

    sku: { type: String, required: true, trim: true, uppercase: true }, // unique
    optionValues: { type: mongoose.Schema.Types.Mixed, default: {} },   // { color:"Red", size:"Free" }

    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    compareAtPrice: { type: Number, default: 0, min: 0 },

    barcode: { type: String, default: "" },

    weightKg: { type: Number, default: 0, min: 0 },
    dimensionsCm: {
      l: { type: Number, default: 0 },
      w: { type: Number, default: 0 },
      h: { type: Number, default: 0 }
    },

    images: [{
      url: { type: String, required: true },
      alt: { type: String, default: "" },
      sortOrder: { type: Number, default: 0 },
    }],

    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

VariantSchema.index({ sku: 1 }, { unique: true });
VariantSchema.index({ productId: 1, isActive: 1 });

module.exports = mongoose.model("Variant", VariantSchema, "product_variants");