import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, trim: true, lowercase: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: false }
);

CategorySchema.index({ slug: 1 }, { unique: true });

export default mongoose.model("Category", CategorySchema, "categories");
