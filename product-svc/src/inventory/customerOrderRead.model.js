import mongoose from "mongoose";

const CustomerOrderReadSchema = new mongoose.Schema(
  {
    status: { type: String, default: "", trim: true },
    fulfillmentStatus: { type: String, default: "", trim: true },
    placedAt: { type: Date, default: Date.now },
    items: [
      {
        stockKey: { type: String, default: "", trim: true },
        title: { type: String, default: "", trim: true },
        quantity: { type: Number, default: 0 },
        fulfillmentStatus: { type: String, default: "", trim: true },
      },
    ],
  },
  {
    collection: "storefront_customer_orders",
  }
);

export default mongoose.models.ProductSvcCustomerOrderRead ||
  mongoose.model("ProductSvcCustomerOrderRead", CustomerOrderReadSchema);
