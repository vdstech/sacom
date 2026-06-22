import mongoose from "mongoose";

const CustomerSessionSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductSvcStorefrontCustomer",
      required: true,
      index: true,
    },
    refreshTokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  {
    timestamps: true,
    collection: "storefront_customer_sessions",
  }
);

CustomerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ProductSvcStorefrontCustomerSession ||
  mongoose.model("ProductSvcStorefrontCustomerSession", CustomerSessionSchema);
