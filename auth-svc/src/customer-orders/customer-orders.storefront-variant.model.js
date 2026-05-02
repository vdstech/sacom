import mongoose from "mongoose";

const StorefrontVariantReadSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    price: { type: Number, default: 0 },
    discount: {
      type: {
        type: String,
        enum: ["none", "percent", "flat"],
        default: "none",
      },
      value: { type: Number, default: 0 },
      label: { type: String, default: "" },
    },
    images: [
      {
        url: { type: String, default: "" },
        alt: { type: String, default: "" },
        sortOrder: { type: Number, default: 0 },
      },
    ],
    colors: [
      {
        name: { type: String, default: "" },
        hex: { type: String, default: "" },
      },
    ],
    sizeLabel: { type: String, default: "" },
    stock: [
      {
        stockKey: { type: String, default: "" },
        sizeLabel: { type: String, default: "" },
        quantity: { type: Number, default: 0 },
        availableQty: { type: Number, default: 0 },
        reservedQty: { type: Number, default: 0 },
        damagedQty: { type: Number, default: 0 },
        lostQty: { type: Number, default: 0 },
        reorderLevel: { type: Number, default: 0 },
      },
    ],
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "product_variants",
  }
);

export default mongoose.models.StorefrontVariantRead || mongoose.model("StorefrontVariantRead", StorefrontVariantReadSchema);
