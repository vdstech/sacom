import mongoose from "mongoose";

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const ProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true },

    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },

    // Category mapping (your “leaf home”)
    primaryCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    // Where product appears (leaf + optional extra like sale/new-arrivals)
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],

    tags: [{ type: String }],

    currency: { type: String, default: "INR" },

    images: [{
      url: { type: String, required: true },
      alt: { type: String, default: "" },
      sortOrder: { type: Number, default: 0 },
    }],

    // Category-specific flexible data (fabric, workType, etc.)
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Publishing & merchandising
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
  next();
});

// Explicit collection name for microservice compatibility
export default mongoose.model("Product", ProductSchema, "products");
