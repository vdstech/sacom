import mongoose from "mongoose";

const StorefrontCategoryReadSchema = new mongoose.Schema(
  {
    slug: { type: String, default: "", trim: true, lowercase: true },
  },
  {
    collection: "categories",
  }
);

export default mongoose.models.StorefrontCategoryRead || mongoose.model("StorefrontCategoryRead", StorefrontCategoryReadSchema);
