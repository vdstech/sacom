import mongoose from "mongoose";

const AddressSnapshotSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    line1: { type: String, default: "", trim: true },
    line2: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    postalCode: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true },
  },
  { _id: false }
);

// This schema remains a transitional order read-model until checkout is moved
// into a dedicated order-svc. The commercial fields already use immutable
// snapshots so future order ownership can migrate without changing the contract.
const CustomerOrderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, default: null },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    stockKey: { type: String, default: "", trim: true },
    slug: { type: String, default: "" },
    title: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 1 },
    currency: { type: String, default: "INR", trim: true },
    listUnitPrice: { type: Number, default: 0, min: 0 },
    catalogDiscountType: { type: String, default: "none", trim: true },
    catalogDiscountValue: { type: Number, default: 0, min: 0 },
    catalogDiscountLabel: { type: String, default: "", trim: true },
    catalogDiscountAmount: { type: Number, default: 0, min: 0 },
    promoDiscountType: { type: String, default: "none", trim: true },
    promoDiscountValue: { type: Number, default: 0, min: 0 },
    promoDiscountLabel: { type: String, default: "", trim: true },
    promoDiscountAmount: { type: Number, default: 0, min: 0 },
    finalUnitPrice: { type: Number, default: 0, min: 0 },
    lineSubtotal: { type: Number, default: 0, min: 0 },
    lineTaxTotal: { type: Number, default: 0, min: 0 },
    lineShippingTotal: { type: Number, default: 0, min: 0 },
    lineDiscountTotal: { type: Number, default: 0, min: 0 },
    lineGrandTotal: { type: Number, default: 0, min: 0 },
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
    paymentStatus: { type: String, default: "pending", trim: true },
    fulfillmentStatus: { type: String, default: "pending", trim: true },
    currency: { type: String, default: "INR", trim: true },
    pricingVersion: { type: Number, default: 1, min: 1 },
    couponCode: { type: String, default: "", trim: true },
    subtotal: { type: Number, default: 0, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    shippingTotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    itemCount: { type: Number, default: 0, min: 0 },
    paymentReference: { type: String, default: "", trim: true },
    addressSnapshot: { type: AddressSnapshotSchema, default: () => ({}) },
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
