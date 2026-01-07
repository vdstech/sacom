import mongoose from "mongoose";

const NavItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true },

    // optional category link
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },

    // if categoryId is null => path must be provided (/, /collections/new-arrivals, https://...)
    path: { type: String, default: "", trim: true },

    description: { type: String, default: "", trim: true },

    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "NavItem", default: null, index: true },

    // ✅ ordering is stored here (no order field)
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: "NavItem" }],

    // optional helpers
    ancestors: [{ type: mongoose.Schema.Types.ObjectId, ref: "NavItem" }],
    level: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Unique among siblings
NavItemSchema.index({ parentId: 1, slug: 1 }, { unique: true });
NavItemSchema.index({ parentId: 1 });

export default mongoose.model("NavItem", NavItemSchema, "nav_items");