import mongoose from "mongoose";

const CustomerOrderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, default: null },
    slug: { type: String, default: "" },
    title: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const CustomerOrderSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorefrontCustomer",
      required: true,
      index: true,
    },
    status: { type: String, default: "placed", trim: true },
    currency: { type: String, default: "INR", trim: true },
    total: { type: Number, default: 0, min: 0 },
    itemCount: { type: Number, default: 0, min: 0 },
    items: { type: [CustomerOrderItemSchema], default: [] },
    placedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "storefront_customer_orders",
  }
);

CustomerOrderSchema.index({ customer: 1, placedAt: -1 });

export default mongoose.model("StorefrontCustomerOrder", CustomerOrderSchema);
