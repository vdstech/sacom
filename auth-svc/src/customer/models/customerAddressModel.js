import mongoose from "mongoose";

const CustomerAddressSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorefrontCustomer",
      required: true,
      index: true,
    },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: "", trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: "India" },
    isDefault: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "storefront_customer_addresses",
  }
);

CustomerAddressSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model("StorefrontCustomerAddress", CustomerAddressSchema);
