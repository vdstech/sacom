import mongoose from "mongoose";
import {
  DEFAULT_RETURN_POLICY_TEXT,
  DEFAULT_RETURNABLE,
  DEFAULT_RETURN_WINDOW_DAYS,
  DEFAULT_SHIPPING_TEXT,
} from "./defaultMetadata.js";
import { ProductRatingSummarySchema } from "../review/review.model.js";

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const ShippingSchema = new mongoose.Schema(
  {
    text: { type: String, default: DEFAULT_SHIPPING_TEXT },
  },
  { _id: false }
);

const CarePolicySchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
  },
  { _id: false }
);

const ReturnPolicySchema = new mongoose.Schema(
  {
    text: { type: String, default: DEFAULT_RETURN_POLICY_TEXT },
    returnable: { type: Boolean, default: DEFAULT_RETURNABLE },
    windowDays: { type: Number, default: DEFAULT_RETURN_WINDOW_DAYS, min: 0 },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true },

    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },

    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },

    tags: [{ type: String }],
    currency: { type: String, default: "INR" },

    images: [
      {
        url: { type: String, required: true },
        alt: { type: String, default: "" },
        sortOrder: { type: Number, default: 0 },
      },
    ],

    shipping: { type: ShippingSchema, default: () => ({}) },
    care: { type: CarePolicySchema, default: () => ({}) },
    returnPolicy: { type: ReturnPolicySchema, default: () => ({}) },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ratingSummary: { type: ProductRatingSummarySchema, default: () => ({}) },

    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

ProductSchema.index({ slug: 1 }, { unique: true });
ProductSchema.index({ categoryId: 1, isActive: 1 });
ProductSchema.index({ title: "text", description: "text", tags: "text" });

ProductSchema.pre("validate", function (next) {
  if (!this.slug && this.title) this.slug = slugify(this.title);
  if (this.returnPolicy?.returnable === false) {
    this.returnPolicy.windowDays = 0;
  } else if (this.returnPolicy?.returnable === true) {
    this.returnPolicy.windowDays = Math.max(1, Number(this.returnPolicy.windowDays || 0));
  }
  next();
});

export default mongoose.model("Product", ProductSchema, "products");
