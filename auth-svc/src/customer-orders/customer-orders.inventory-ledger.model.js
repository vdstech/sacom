import mongoose from "mongoose";

const InventoryLedgerSchema = new mongoose.Schema(
  {
    stockKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, default: null },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    orderItemId: { type: String, default: "", trim: true, index: true },
    movementType: {
      type: String,
      enum: [
        "RESERVE",
        "RELEASE_RESERVATION",
        "SHIP",
        "RESTOCK_CANCELLED_ITEM",
        "MARK_CANCELLED_ITEM_DAMAGED",
        "MARK_CANCELLED_ITEM_LOST",
      ],
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    availableChange: { type: Number, default: 0 },
    reservedChange: { type: Number, default: 0 },
    damagedChange: { type: Number, default: 0 },
    lostChange: { type: Number, default: 0 },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "User" },
    referenceType: { type: String, default: "", trim: true },
    referenceId: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
    collection: "inventory_ledgers",
  }
);

export default mongoose.models.InventoryLedger ||
  mongoose.model("InventoryLedger", InventoryLedgerSchema);
