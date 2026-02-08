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

const InventorySchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", required: true },

    trackInventory: { type: Boolean, default: true },
    availableQty: { type: Number, default: 0, min: 0 },
    reservedQty: { type: Number, default: 0, min: 0 },

    allowBackorder: { type: Boolean, default: false },
    reorderLevel: { type: Number, default: 0, min: 0 },

    display: {
      colorName: { type: String, default: "" },
      sizeLabel: { type: String, default: "" },
      materialLabel: { type: String, default: "" },
    },

    care: { type: CarePolicySchema, default: () => ({}) },
    returnPolicy: { type: ReturnPolicySchema, default: () => ({}) },

    fulfillment: {
      warehouseCode: { type: String, default: "" },
      binLocation: { type: String, default: "" },
      restockEtaDays: { type: Number, default: 0, min: 0 },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

InventorySchema.index({ sku: 1 }, { unique: true });
InventorySchema.index({ productId: 1 });
InventorySchema.index({ variantId: 1 });
InventorySchema.index({ productId: 1, "display.colorName": 1, "display.sizeLabel": 1 });

InventorySchema.pre("validate", function (next) {
  if (this.returnPolicy?.returnable === false) {
    this.returnPolicy.windowDays = 0;
    this.returnPolicy.type = "none";
  }
  next();
});

export default mongoose.model("Inventory", InventorySchema, "inventory");
