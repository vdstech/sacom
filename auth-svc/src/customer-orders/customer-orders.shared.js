function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export const ORDER_ITEM_FULFILLMENT_STATUSES = [
  "RESERVED",
  "PICKED_FROM_WAREHOUSE",
  "HANDED_TO_PACKAGING",
  "PACKAGING_RECEIVED",
  "PACKAGING_IN_PROGRESS",
  "PACKED",
  "HANDED_TO_SHIPPING",
  "SHIPPING_RECEIVED",
  "SHIPPING_IN_PROGRESS",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED_BEFORE_PICKING",
  "CANCEL_REQUESTED",
  "HANDED_TO_CANCELLATION",
  "CANCELLATION_RECEIVED",
  "CANCEL_RESTOCKED",
  "CANCEL_DAMAGED",
  "CANCEL_LOST",
  "CANCEL_CLOSED",
  "RETURN_REQUESTED",
  "COLLECTION_SCHEDULED",
  "RETURN_IN_TRANSIT",
  "RETURN_RECEIVED",
  "INVENTORY_ACCEPTANCE_PENDING_RETURN",
  "REFUND_COMPLETED",
];

export const ORDER_PARENT_STATUSES = [
  "PLACED",
  "PARTIALLY_PICKED",
  "PICKED",
  "PARTIALLY_PACKED",
  "PACKED",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "PARTIALLY_CANCELLED",
  "CANCELLED",
  "CLOSED",
];

export const ORDER_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "payment_failed",
  "refund_pending",
  "partially_refunded",
  "refunded",
];

export const PHYSICAL_OWNER_VALUES = [
  "WAREHOUSE",
  "PROCESSING_MANAGER",
  "PACKAGING_MANAGER",
  "SHIPPING_OPERATOR",
  "CANCELLATION_MANAGER",
  "COURIER",
  "NONE",
];

export const PROCESSING_QUEUE_STATUSES = ["RESERVED", "PICKED_FROM_WAREHOUSE", "HANDED_TO_PACKAGING"];
export const PACKAGING_QUEUE_STATUSES = ["HANDED_TO_PACKAGING", "PACKAGING_RECEIVED", "PACKAGING_IN_PROGRESS", "PACKED", "HANDED_TO_SHIPPING"];
export const SHIPPING_QUEUE_STATUSES = ["HANDED_TO_SHIPPING", "SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"];
export const CANCELLATION_QUEUE_STATUSES = ["CANCEL_REQUESTED", "HANDED_TO_CANCELLATION", "CANCELLATION_RECEIVED"];
export const FINAL_CANCELLATION_STATUSES = ["CANCELLED_BEFORE_PICKING", "CANCEL_RESTOCKED", "CANCEL_DAMAGED", "CANCEL_LOST", "CANCEL_CLOSED"];
export const POST_PICK_PRE_SHIPMENT_STATUSES = [
  "PICKED_FROM_WAREHOUSE",
  "HANDED_TO_PACKAGING",
  "PACKAGING_RECEIVED",
  "PACKAGING_IN_PROGRESS",
  "PACKED",
  "HANDED_TO_SHIPPING",
  "SHIPPING_RECEIVED",
  "SHIPPING_IN_PROGRESS",
];

const LEGACY_STATUS_MAP = {
  pending: "RESERVED",
  placed: "RESERVED",
  processing: "RESERVED",
  picked_from_warehouse: "PICKED_FROM_WAREHOUSE",
  handed_to_packaging: "HANDED_TO_PACKAGING",
  packaging_received: "PACKAGING_RECEIVED",
  packaging_in_progress: "PACKAGING_IN_PROGRESS",
  packed: "PACKED",
  handed_to_shipping: "HANDED_TO_SHIPPING",
  shipping_received: "SHIPPING_RECEIVED",
  shipping_in_progress: "SHIPPING_IN_PROGRESS",
  shipped: "SHIPPED",
  delivered: "DELIVERED",
  cancelled_before_picking: "CANCELLED_BEFORE_PICKING",
  cancel_requested: "CANCEL_REQUESTED",
  cancellation_requested: "CANCEL_REQUESTED",
  handed_to_cancellation: "HANDED_TO_CANCELLATION",
  cancellation_receipt_pending: "HANDED_TO_CANCELLATION",
  cancellation_received: "CANCELLATION_RECEIVED",
  cancel_restocked: "CANCEL_RESTOCKED",
  inventory_acceptance_pending_cancel: "CANCELLATION_RECEIVED",
  cancelled: "CANCEL_RESTOCKED",
  cancelled_by_admin: "CANCEL_RESTOCKED",
  cancel_damaged: "CANCEL_DAMAGED",
  cancel_lost: "CANCEL_LOST",
  cancel_closed: "CANCEL_CLOSED",
  return_requested: "RETURN_REQUESTED",
  collection_scheduled: "COLLECTION_SCHEDULED",
  return_in_transit: "RETURN_IN_TRANSIT",
  return_received: "RETURN_RECEIVED",
  inventory_acceptance_pending_return: "INVENTORY_ACCEPTANCE_PENDING_RETURN",
  refund_completed: "REFUND_COMPLETED",
};

const REFUND_PENDING_ITEM_STATUSES = [
  "RETURN_REQUESTED",
  "COLLECTION_SCHEDULED",
  "RETURN_IN_TRANSIT",
  "RETURN_RECEIVED",
  "INVENTORY_ACCEPTANCE_PENDING_RETURN",
];

function normalizeStatusInput(value, fallback = "RESERVED") {
  const raw = normalizeString(value, fallback);
  if (!raw) return fallback;
  if (ORDER_ITEM_FULFILLMENT_STATUSES.includes(raw)) return raw;
  const normalized = raw.toLowerCase();
  return LEGACY_STATUS_MAP[normalized] || fallback;
}

export function buildOrderItemId(item, index = 0) {
  return normalizeString(item?.lineId) || `item-${index}`;
}

export function normalizeItemFulfillmentStatus(value, fallback = "RESERVED") {
  if (fallback === "") {
    const normalized = normalizeStatusInput(value, "");
    return ORDER_ITEM_FULFILLMENT_STATUSES.includes(normalized) ? normalized : "";
  }
  return normalizeStatusInput(value, fallback);
}

export function normalizePaymentStatus(value, fallback = "pending") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (ORDER_PAYMENT_STATUSES.includes(normalized)) return normalized;
  return fallback;
}

export function normalizePhysicalOwner(value, fallback = "NONE") {
  const normalized = normalizeString(value, fallback).toUpperCase();
  if (PHYSICAL_OWNER_VALUES.includes(normalized)) return normalized;
  return fallback;
}

function itemStatusFromInput(input, fallback = "RESERVED") {
  if (typeof input === "string") return normalizeItemFulfillmentStatus(input, fallback);
  return normalizeItemFulfillmentStatus(input?.fulfillmentStatus, fallback);
}

export function isCustomerCancellableItem(input) {
  return ["RESERVED", "PICKED_FROM_WAREHOUSE"].includes(itemStatusFromInput(input));
}

export function isCustomerPackedCancellationRequestable(input) {
  return itemStatusFromInput(input) === "PACKED";
}

export function isCustomerShippingCancellationRequestable(input) {
  return ["SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(itemStatusFromInput(input));
}

export function isPackedItemAdminCancelable(input) {
  return itemStatusFromInput(input) === "PACKED";
}

export function isCustomerReturnableItem(input) {
  return itemStatusFromInput(input) === "DELIVERED";
}

export function isPreShipmentStatus(status) {
  return ["RESERVED", ...POST_PICK_PRE_SHIPMENT_STATUSES].includes(normalizeItemFulfillmentStatus(status, ""));
}

export function isCancellationLaneStatus(status) {
  return ["HANDED_TO_CANCELLATION", "CANCELLATION_RECEIVED", ...FINAL_CANCELLATION_STATUSES]
    .includes(normalizeItemFulfillmentStatus(status, ""));
}

export function isReturnLaneStatus(status) {
  return [
    "RETURN_REQUESTED",
    "COLLECTION_SCHEDULED",
    "RETURN_IN_TRANSIT",
    "RETURN_RECEIVED",
    "INVENTORY_ACCEPTANCE_PENDING_RETURN",
    "REFUND_COMPLETED",
  ].includes(normalizeItemFulfillmentStatus(status, ""));
}

export function validateAdminItemStatusTransition({
  currentStatus,
  nextStatus,
  outboundTrackingNumber = "",
  collectionTrackingNumber = "",
  cancelRequestedAt = null,
  courierName = "",
  packageVerificationStatus = "",
  labelStatus = "",
}) {
  const current = normalizeItemFulfillmentStatus(currentStatus, "");
  const next = normalizeItemFulfillmentStatus(nextStatus, "");
  const outboundTracking = normalizeString(outboundTrackingNumber);
  const collectionTracking = normalizeString(collectionTrackingNumber);
  const courier = normalizeString(courierName);
  const verification = normalizeString(packageVerificationStatus).toUpperCase();
  const label = normalizeString(labelStatus).toUpperCase();
  const hasCancellationRequest = !!cancelRequestedAt;

  if (!current || !next) return { ok: false, error: "A valid fulfillment status is required" };
  if (current === next) return { ok: false, error: "Select a different fulfillment status" };

  if (current === "RESERVED" && next === "PICKED_FROM_WAREHOUSE") return { ok: true };
  if (current === "PICKED_FROM_WAREHOUSE" && next === "HANDED_TO_PACKAGING") return { ok: true };
  if (current === "HANDED_TO_PACKAGING" && next === "PACKAGING_RECEIVED") return { ok: true };
  if (current === "PACKAGING_RECEIVED" && next === "PACKAGING_IN_PROGRESS") return { ok: true };
  if (current === "PACKAGING_IN_PROGRESS" && next === "PACKED") {
    if (verification !== "VERIFIED") {
      return { ok: false, error: "Package verification is required before packing is completed" };
    }
    if (label !== "PRINTED") {
      return { ok: false, error: "Shipping label must be printed before packing is completed" };
    }
    return { ok: true };
  }
  if (current === "PACKED" && next === "HANDED_TO_SHIPPING") {
    if (hasCancellationRequest) {
      return { ok: false, error: "Packed items with a cancellation request cannot move to shipping" };
    }
    return { ok: true };
  }
  if (current === "HANDED_TO_SHIPPING" && next === "SHIPPING_RECEIVED") return { ok: true };
  if (current === "SHIPPING_RECEIVED" && next === "SHIPPING_IN_PROGRESS") return { ok: true };
  if (current === "SHIPPING_IN_PROGRESS" && next === "SHIPPED") {
    if (!courier) return { ok: false, error: "Courier must be selected before tracking number is entered" };
    if (!outboundTracking) return { ok: false, error: "Tracking number is required before marking item as shipped" };
    return { ok: true };
  }
  if (current === "SHIPPED" && next === "DELIVERED") return { ok: true };
  if (current === "CANCEL_REQUESTED" && next === "HANDED_TO_CANCELLATION") return { ok: true };
  if (current === "HANDED_TO_CANCELLATION" && next === "CANCELLATION_RECEIVED") return { ok: true };
  if (current === "RETURN_REQUESTED" && next === "COLLECTION_SCHEDULED") {
    if (!collectionTracking) return { ok: false, error: "Collection tracking number is required before scheduling collection" };
    return { ok: true };
  }
  if (current === "COLLECTION_SCHEDULED" && next === "RETURN_IN_TRANSIT") return { ok: true };
  if (current === "RETURN_IN_TRANSIT" && next === "INVENTORY_ACCEPTANCE_PENDING_RETURN") return { ok: true };

  return { ok: false, error: `Cannot change item status from ${current || "-"} to ${next || "-"}` };
}

function getNormalizedItems(order) {
  return (Array.isArray(order?.items) ? order.items : []).map((item) => normalizeItemFulfillmentStatus(item?.fulfillmentStatus, ""));
}

export function resolveOrderFulfillmentStatus(order) {
  const items = getNormalizedItems(order);
  if (!items.length) return "PLACED";

  const activeItems = items.filter((status) => status && !FINAL_CANCELLATION_STATUSES.includes(status));
  const cancelledItems = items.filter((status) => FINAL_CANCELLATION_STATUSES.includes(status));
  const shippedItems = items.filter((status) => ["SHIPPED", "DELIVERED"].includes(status));

  if (cancelledItems.length === items.length) return "CANCELLED";
  if (shippedItems.length === items.length) return "SHIPPED";
  if (cancelledItems.length > 0 && (activeItems.length > 0 || shippedItems.length > 0)) return "PARTIALLY_CANCELLED";
  if (shippedItems.length > 0) return "PARTIALLY_SHIPPED";

  if (activeItems.length && activeItems.every((status) => status === "PACKED")) return "PACKED";
  if (activeItems.some((status) => ["PACKAGING_RECEIVED", "PACKAGING_IN_PROGRESS", "PACKED", "HANDED_TO_SHIPPING", "SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(status))) {
    return activeItems.length > 1 ? "PARTIALLY_PACKED" : activeItems[0] === "PACKED" ? "PACKED" : "PARTIALLY_PACKED";
  }

  if (activeItems.length && activeItems.every((status) => status === "PICKED_FROM_WAREHOUSE")) return "PICKED";
  if (activeItems.some((status) => ["PICKED_FROM_WAREHOUSE", "HANDED_TO_PACKAGING"].includes(status))) return "PARTIALLY_PICKED";

  return "PLACED";
}

export function resolveOrderPaymentStatus(order) {
  const fallback = normalizePaymentStatus(order?.paymentStatus, "paid");
  if (fallback === "payment_failed") return "payment_failed";
  const items = getNormalizedItems(order);
  if (!items.length) return fallback;

  const refundedCount = items.filter((status) => [...FINAL_CANCELLATION_STATUSES, "REFUND_COMPLETED"].includes(status)).length;
  const hasPendingRefund = items.some((status) => REFUND_PENDING_ITEM_STATUSES.includes(status));

  if (hasPendingRefund) return "refund_pending";
  if (refundedCount === items.length && refundedCount > 0) return "refunded";
  if (refundedCount > 0) return "partially_refunded";
  return fallback;
}

function mapHandoverSnapshot(item) {
  return item?.pendingHandover ? {
    type: normalizeString(item.pendingHandover.type),
    status: normalizeString(item.pendingHandover.status),
    fromOwner: normalizeString(item.pendingHandover.fromOwner),
    toOwner: normalizeString(item.pendingHandover.toOwner),
    handedOverBy: normalizeString(item.pendingHandover.handedOverBy),
    handedOverAt: item.pendingHandover.handedOverAt || null,
    rejectionReason: normalizeString(item.pendingHandover.rejectionReason),
  } : null;
}

export function mapOrder(order) {
  const grandTotal = asNumber(order?.grandTotal, asNumber(order?.total, 0));
  const fulfillmentStatus = resolveOrderFulfillmentStatus(order);
  const paymentStatus = resolveOrderPaymentStatus(order);

  return {
    id: String(order?._id || ""),
    placedAt: order?.placedAt,
    status: normalizeString(order?.status, fulfillmentStatus),
    paymentStatus,
    fulfillmentStatus,
    itemCount: Math.max(0, asNumber(order?.itemCount, Array.isArray(order?.items) ? order.items.length : 0)),
    subtotal: asNumber(order?.subtotal, 0),
    discountTotal: asNumber(order?.discountTotal, 0),
    shippingTotal: asNumber(order?.shippingTotal, 0),
    taxTotal: asNumber(order?.taxTotal, 0),
    grandTotal,
    total: grandTotal,
    currency: normalizeString(order?.currency, "INR"),
    pricingVersion: asNumber(order?.pricingVersion, 1),
    couponCode: normalizeString(order?.couponCode),
    couponDiscountTotal: asNumber(order?.couponDiscountTotal, 0),
    couponAppliedAmount: asNumber(order?.couponAppliedAmount, 0),
    couponForfeitedAmount: asNumber(order?.couponForfeitedAmount, 0),
    paymentReference: normalizeString(order?.paymentReference),
    addressSnapshot: order?.addressSnapshot || null,
    items: (Array.isArray(order?.items) ? order.items : []).map((item, index) => ({
      id: buildOrderItemId(item, index),
      productId: item?.productId ? String(item.productId) : "",
      variantId: item?.variantId ? String(item.variantId) : "",
      categoryId: item?.categoryId ? String(item.categoryId) : "",
      categoryLabel: normalizeString(item?.categoryLabel),
      stockKey: normalizeString(item?.stockKey),
      slug: normalizeString(item?.slug),
      title: normalizeString(item?.title, "Product"),
      imageUrl: normalizeString(item?.imageUrl),
      quantity: Math.max(1, asNumber(item?.quantity, 1)),
      fulfillmentStatus: normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED"),
      physicalOwner: normalizePhysicalOwner(item?.physicalOwner, "NONE"),
      cancellationSource: normalizeString(item?.cancellationSource),
      cancellationReason: normalizeString(item?.cancellationReason),
      packageVerificationStatus: normalizeString(item?.packageVerificationStatus, "PENDING"),
      labelStatus: normalizeString(item?.labelStatus, "NOT_PRINTED"),
      labelReprintCount: asNumber(item?.labelReprintCount, 0),
      labelReprintReason: normalizeString(item?.labelReprintReason),
      courierName: normalizeString(item?.courierName),
      outboundTrackingNumber: normalizeString(item?.outboundTrackingNumber),
      cancelRequestedAt: item?.cancelRequestedAt || null,
      pickedAt: item?.pickedAt || null,
      pickedBy: item?.pickedBy ? String(item.pickedBy) : "",
      handedToPackagingAt: item?.handedToPackagingAt || null,
      packagingReceivedAt: item?.packagingReceivedAt || null,
      packagingStartedAt: item?.packagingStartedAt || null,
      packageVerifiedAt: item?.packageVerifiedAt || null,
      labelPrintedAt: item?.labelPrintedAt || null,
      packedAt: item?.packedAt || null,
      handedToShippingAt: item?.handedToShippingAt || null,
      shippingReceivedAt: item?.shippingReceivedAt || null,
      shippingStartedAt: item?.shippingStartedAt || null,
      trackingNumberEnteredAt: item?.trackingNumberEnteredAt || null,
      shippedAt: item?.shippedAt || null,
      deliveredAt: item?.deliveredAt || null,
      deliveredBy: item?.deliveredBy ? String(item.deliveredBy) : "",
      cancellationReceivedAt: item?.cancellationReceivedAt || null,
      cancellationClosedAt: item?.cancellationClosedAt || null,
      pendingHandover: mapHandoverSnapshot(item),
      lineSubtotal: asNumber(item?.lineSubtotal, 0),
      lineTaxTotal: asNumber(item?.lineTaxTotal, 0),
      lineShippingTotal: asNumber(item?.lineShippingTotal, 0),
      lineDiscountTotal: asNumber(item?.lineDiscountTotal, 0),
      lineGrandTotal: asNumber(item?.lineGrandTotal, asNumber(item?.lineTotal, 0)),
      unitPrice: asNumber(item?.unitPrice, 0),
      lineTotal: asNumber(item?.lineTotal, 0),
    })),
  };
}
