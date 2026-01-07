import mongoose from "mongoose";

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },

    // URL slug for category page: /c/sarees or /c/sarees/silk-sarees
    slug: { type: String, required: true, trim: true, lowercase: true },

    description: { type: String, default: "" },

    // Parent category (null = root)
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },

    // Materialized hierarchy helpers (fast reads):
    ancestors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }], // root -> ... -> parent
    level: { type: Number, default: 0 }, // root=0, child=1, ...

    // Optional: stable path for routing/breadcrumbs (computed)
    path: { type: String, default: "" }, // e.g. "sarees/silk-sarees"

    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },

    // Optional UI/SEO fields
    imageUrl: { type: String, default: "" },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },

    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Keep categories unique under the same parent by slug
CategorySchema.index({ parent: 1, slug: 1 }, { unique: true });

// Useful indexes for browsing
CategorySchema.index({ isActive: 1, sortOrder: 1 });
CategorySchema.index({ ancestors: 1 });
CategorySchema.index({ path: 1 });

// Pre-validate: ensure slug exists
CategorySchema.pre("validate", function (next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  next();
});

// Pre-save: compute ancestors/level/path
CategorySchema.pre("save", async function (next) {
  try {
    if (!this.isModified("parent") && !this.isModified("slug") && !this.isModified("name")) {
      return next();
    }

    if (!this.parent) {
      this.ancestors = [];
      this.level = 0;
      this.path = this.slug;
      return next();
    }

    const parentDoc = await mongoose.model("Category").findById(this.parent).select("ancestors level path slug");
    if (!parentDoc) {
      return next(new Error("Parent category not found"));
    }

    this.ancestors = [...parentDoc.ancestors, parentDoc._id];
    this.level = parentDoc.level + 1;
    this.path = parentDoc.path ? `${parentDoc.path}/${this.slug}` : this.slug;

    next();
  } catch (err) {
    next(err);
  }
});

// IMPORTANT: force collection name for microservice compatibility
export default mongoose.model("Category", CategorySchema, "categories");
