import mongoose from "mongoose";

export const NOTIFICATION_PLACEHOLDER_CHANNELS = ["EMAIL", "SMS"];
export const NOTIFICATION_PLACEHOLDER_STATUSES = ["PENDING"];

const NotificationPlaceholderSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "StorefrontCustomer", index: true },
    couponId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "ExchangeCoupon", index: true },
    kind: { type: String, required: true, trim: true, default: "EXCHANGE_COUPON_GENERATED" },
    channel: { type: String, enum: NOTIFICATION_PLACEHOLDER_CHANNELS, required: true },
    status: { type: String, enum: NOTIFICATION_PLACEHOLDER_STATUSES, default: "PENDING" },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: "notification_placeholders",
  }
);

NotificationPlaceholderSchema.index({ couponId: 1, channel: 1 }, { unique: true });

export default mongoose.models.NotificationPlaceholder ||
  mongoose.model("NotificationPlaceholder", NotificationPlaceholderSchema);
