import mongoose from "mongoose";

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

const VariantSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },

    sku: { type: String, required: true, trim: true, uppercase: true },

    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    compareAtPrice: { type: Number, default: 0, min: 0 },

    barcode: { type: String, default: "" },

    weightKg: { type: Number, default: 0, min: 0 },
    dimensionsCm: {
      l: { type: Number, default: 0 },
      w: { type: Number, default: 0 },
      h: { type: Number, default: 0 },
    },

    images: [
      {
        url: { type: String, required: true },
        alt: { type: String, default: "" },
        sortOrder: { type: Number, default: 0 },
      },
    ],

    merchandise: {
      color: {
        name: { type: String, required: true, trim: true },
        family: { type: String, default: "" },
        hex: { type: String, default: "" },
      },
      size: {
        label: { type: String, default: "" },
        system: { type: String, default: "" },
        sortKey: { type: Number, default: 0 },
      },
      blouse: {
        included: { type: Boolean, default: false },
        type: { type: String, default: "" },
        lengthMeters: { type: Number, default: 0, min: 0 },
      },
      saree: {
        lengthMeters: { type: Number, default: 0, min: 0 },
        widthMeters: { type: Number, default: 0, min: 0 },
        weightGrams: { type: Number, default: 0, min: 0 },
        fallPicoDone: { type: Boolean, default: false },
        stitchReady: { type: Boolean, default: false },
      },
      style: {
        occasionTags: { type: [String], default: [] },
        workType: { type: String, default: "" },
        pattern: { type: String, default: "" },
      },
      careOverride: { type: CarePolicySchema, default: null },
      returnPolicyOverride: { type: ReturnPolicySchema, default: null },
    },

    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

VariantSchema.index({ sku: 1 }, { unique: true });
VariantSchema.index({ productId: 1, isActive: 1 });
VariantSchema.index({ productId: 1, "merchandise.color.name": 1, "merchandise.size.label": 1, isActive: 1 });

VariantSchema.pre("validate", function (next) {
  if (this.merchandise?.color?.hex) {
    this.merchandise.color.hex = String(this.merchandise.color.hex).trim();
  }
  if (this.merchandise?.returnPolicyOverride?.returnable === false) {
    this.merchandise.returnPolicyOverride.windowDays = 0;
    this.merchandise.returnPolicyOverride.type = "none";
  }
  next();
});

export default mongoose.model("Variant", VariantSchema, "product_variants");
