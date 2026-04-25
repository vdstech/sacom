import mongoose from "mongoose";

const StorefrontInventoryReadSchema = new mongoose.Schema(
  {
    stockKey: { type: String, default: "", trim: true, uppercase: true },
    productId: { type: mongoose.Schema.Types.ObjectId, default: null },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sizeLabel: { type: String, default: "", trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
  },
  {
    collection: "inventory",
  }
);

export default mongoose.models.StorefrontInventoryRead ||
  mongoose.model("StorefrontInventoryRead", StorefrontInventoryReadSchema);
