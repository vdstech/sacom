import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "", trim: true },
    passwordHash: { type: String, required: true },
    disabled: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "storefront_customers",
  }
);

CustomerSchema.index({ email: 1 }, { unique: true });

export default mongoose.models.ProductSvcStorefrontCustomer ||
  mongoose.model("ProductSvcStorefrontCustomer", CustomerSchema);
