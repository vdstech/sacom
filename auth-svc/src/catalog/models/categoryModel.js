const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },

    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },

    // for ordering inside same parent
    sortOrder: { type: Number, default: 0 },

    // publish/visibility
    isActive: { type: Boolean, default: true },

    // optional metadata (add more later)
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

// IMPORTANT: slug should be unique per parent (siblings cannot share same slug)
// This allows same slug under different parent paths if you want.
CategorySchema.index({ parentId: 1, sortOrder: 1 });
CategorySchema.index({ parentId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model("Category", CategorySchema);