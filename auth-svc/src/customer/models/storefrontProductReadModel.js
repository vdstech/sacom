import mongoose from "mongoose";

const StorefrontProductReadSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    slug: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    categoryId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isActive: { type: Boolean, default: true },
    images: [
      {
        url: { type: String, default: "" },
        alt: { type: String, default: "" },
        sortOrder: { type: Number, default: 0 },
      },
    ],
  },
  {
    collection: "products",
  }
);

export default mongoose.models.StorefrontProductRead || mongoose.model("StorefrontProductRead", StorefrontProductReadSchema);
