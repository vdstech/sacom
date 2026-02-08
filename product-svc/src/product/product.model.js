import mongoose from "mongoose";

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const CarePolicySchema = new mongoose.Schema(
  {
    washCare: { type: [String], default: [] },
    ironCare: { type: String, default: "" },
    bleach: { type: String, default: "" },
    dryClean: { type: String, default: "" },
    dryInstructions: { type: String, default: "" },
  },
  { _id: false }
);

const ReturnPolicySchema = new mongoose.Schema(
  {
    returnable: { type: Boolean, default: false },
    windowDays: { type: Number, default: 0, min: 0 },
    type: {
      type: String,
      enum: ["none", "exchange", "refund", "exchange_or_refund"],
      default: "none",
    },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true },

    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },

    primaryCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],

    tags: [{ type: String }],
    currency: { type: String, default: "INR" },

    images: [
      {
        url: { type: String, required: true },
        alt: { type: String, default: "" },
        sortOrder: { type: Number, default: 0 },
      },
    ],

    materialProfile: {
      fabric: { type: String, default: "" },
      weave: { type: String, default: "" },
      workType: { type: String, default: "" },
      pattern: { type: String, default: "" },
      borderStyle: { type: String, default: "" },
      palluStyle: { type: String, default: "" },
    },

    occasionTags: { type: [String], default: [] },

    blouseDefault: {
      included: { type: Boolean, default: false },
      type: { type: String, default: "" },
      lengthMeters: { type: Number, default: 0, min: 0 },
    },

    careDefault: { type: CarePolicySchema, default: () => ({}) },
    returnPolicyDefault: { type: ReturnPolicySchema, default: () => ({}) },

    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },

    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },

    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

ProductSchema.index({ slug: 1 }, { unique: true });
ProductSchema.index({ primaryCategoryId: 1, isActive: 1 });
ProductSchema.index({ categoryIds: 1, isActive: 1 });
ProductSchema.index({ title: "text", description: "text", tags: "text" });

ProductSchema.pre("validate", function (next) {
  if (!this.slug && this.title) this.slug = slugify(this.title);
  if (!this.categoryIds || this.categoryIds.length === 0) {
    this.categoryIds = [this.primaryCategoryId];
  }
  if (this.returnPolicyDefault?.returnable === false) {
    this.returnPolicyDefault.windowDays = 0;
    this.returnPolicyDefault.type = "none";
  }
  next();
});

export default mongoose.model("Product", ProductSchema, "products");
