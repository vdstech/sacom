import mongoose from "mongoose";

const ReviewCustomerOrderReadSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    displayId: { type: String, default: "", trim: true },
    paymentStatus: { type: String, default: "", trim: true },
    placedAt: { type: Date, default: Date.now },
    items: [
      {
        lineId: { type: String, default: "", trim: true },
        productId: { type: mongoose.Schema.Types.ObjectId, default: null },
        variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
        title: { type: String, default: "", trim: true },
        fulfillmentStatus: { type: String, default: "", trim: true },
        deliveredAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
      },
    ],
  },
  {
    collection: "storefront_customer_orders",
  }
);

export default mongoose.models.ProductSvcReviewCustomerOrderRead ||
  mongoose.model("ProductSvcReviewCustomerOrderRead", ReviewCustomerOrderReadSchema);
