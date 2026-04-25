import mongoose from "mongoose";

const CustomerWishlistSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorefrontCustomer",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "storefront_customer_wishlist",
  }
);

CustomerWishlistSchema.index({ customer: 1, productId: 1 }, { unique: true });

export default mongoose.model("StorefrontCustomerWishlist", CustomerWishlistSchema);
