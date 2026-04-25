import mongoose from "mongoose";

const CartLineReadSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, default: null },
    productSlug: { type: String, default: "", trim: true },
    productTitle: { type: String, default: "", trim: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    stockKey: { type: String, default: "", trim: true, uppercase: true },
    sizeLabel: { type: String, default: "", trim: true },
    colorName: { type: String, default: "", trim: true },
    imageUrl: { type: String, default: "", trim: true },
    unitPrice: { type: Number, default: 0, min: 0 },
    effectivePrice: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, default: 1, min: 0 },
    available: { type: Boolean, default: true },
  },
  { _id: true }
);

const StorefrontCartReadSchema = new mongoose.Schema(
  {
    cartToken: { type: String, required: true, trim: true },
    items: { type: [CartLineReadSchema], default: [] },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
  },
  {
    collection: "carts",
  }
);

export default mongoose.models.StorefrontCartRead || mongoose.model("StorefrontCartRead", StorefrontCartReadSchema);
