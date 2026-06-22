import mongoose from "mongoose";

const CartLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productSlug: { type: String, default: "", trim: true },
    productTitle: { type: String, default: "", trim: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", required: true },
    stockKey: { type: String, required: true, trim: true, uppercase: true },
    sizeLabel: { type: String, default: "", trim: true },
    colorName: { type: String, default: "", trim: true },
    imageUrl: { type: String, default: "", trim: true },
    unitPrice: { type: Number, default: 0, min: 0 },
    effectivePrice: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0.05, min: 0, max: 0.9999 },
    quantity: { type: Number, default: 1, min: 0 },
    available: { type: Boolean, default: true },
  },
  { _id: true }
);

const CartSchema = new mongoose.Schema(
  {
    cartToken: { type: String, required: true, trim: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    items: { type: [CartLineSchema], default: [] },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Cart = mongoose.model("Cart", CartSchema, "carts");

export async function syncCartIndexes(logger = null) {
  try {
    await Cart.syncIndexes();
    if (logger?.info) logger.info("Cart indexes synced");
  } catch (err) {
    if (logger?.warn) {
      logger.warn({ err }, "Failed to sync cart indexes");
      return;
    }
    throw err;
  }
}

export default Cart;
