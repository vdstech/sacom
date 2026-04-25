function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export const ORDER_ITEM_FULFILLMENT_STATUSES = [
  "processing",
  "packed",
  "unpacked",
  "shipped",
  "delivered",
  "cancelled",
  "cancelled_by_admin",
  "return_requested",
  "collection_scheduled",
  "return_in_transit",
  "return_received",
  "refund_completed",
];

export const ORDER_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "payment_failed",
  "refund_pending",
  "partially_refunded",
  "refunded",
];

export const RETURN_PENDING_ITEM_STATUSES = [
  "return_requested",
  "collection_scheduled",
  "return_in_transit",
  "return_received",
];

const REFUNDED_ITEM_STATUSES = ["cancelled", "cancelled_by_admin", "refund_completed"];

export function buildOrderItemId(item, index = 0) {
  return normalizeString(item?.lineId) || `item-${index}`;
}

export function normalizeItemFulfillmentStatus(value, fallback = "processing") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (normalized === "pending" || normalized === "placed") return "processing";
  if (ORDER_ITEM_FULFILLMENT_STATUSES.includes(normalized)) return normalized;
  return fallback;
}

export function normalizePaymentStatus(value, fallback = "pending") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (ORDER_PAYMENT_STATUSES.includes(normalized)) return normalized;
  return fallback;
}

function itemStatusFromInput(input, fallback = "processing") {
  if (typeof input === "string") return normalizeItemFulfillmentStatus(input, fallback);
  return normalizeItemFulfillmentStatus(input?.fulfillmentStatus, fallback);
}

export function isCustomerCancellableItem(input) {
  return itemStatusFromInput(input) === "processing";
}

export function isCustomerPackedCancellationRequestable(input) {
  return itemStatusFromInput(input) === "packed";
}

export function isPackedItemAdminCancelable(input) {
  return itemStatusFromInput(input) === "packed";
}

export function isCustomerReturnableItem(input) {
  return itemStatusFromInput(input) === "delivered";
}

export function validateAdminItemStatusTransition({
  currentStatus,
  nextStatus,
  outboundTrackingNumber = "",
  collectionTrackingNumber = "",
  cancelRequestedAt = null,
}) {
  const current = normalizeItemFulfillmentStatus(currentStatus, "");
  const next = normalizeItemFulfillmentStatus(nextStatus, "");
  const outboundTracking = normalizeString(outboundTrackingNumber);
  const collectionTracking = normalizeString(collectionTrackingNumber);
  const hasCancellationRequest = !!cancelRequestedAt;

  if (!current || !next) return { ok: false, error: "A valid fulfillment status is required" };
  if (current === next) return { ok: false, error: "Select a different fulfillment status" };

  if (current === "processing" && next === "packed") {
    return { ok: true, requiresRestock: false };
  }

  if (current === "packed" && next === "shipped") {
    if (hasCancellationRequest) {
      return { ok: false, error: "Packed items with a cancellation request cannot be shipped" };
    }
    if (!outboundTracking) {
      return { ok: false, error: "Outbound tracking number is required before shipping" };
    }
    return { ok: true, requiresRestock: false };
  }

  if (current === "shipped" && next === "delivered") {
    return { ok: true, requiresRestock: false };
  }

  if (current === "return_requested" && next === "collection_scheduled") {
    if (!collectionTracking) {
      return { ok: false, error: "Collection tracking number is required before scheduling collection" };
    }
    return { ok: true, requiresRestock: false };
  }

  if (current === "collection_scheduled" && next === "return_in_transit") {
    return { ok: true, requiresRestock: false };
  }

  if (current === "return_in_transit" && next === "return_received") {
    return { ok: true, requiresRestock: true };
  }

  if (current === "return_received" && next === "refund_completed") {
    return { ok: true, requiresRestock: false };
  }

  return { ok: false, error: `Cannot change item status from ${current || "-"} to ${next || "-"}` };
}

export function resolveOrderFulfillmentStatus(order) {
  const status = normalizeString(order?.status).toLowerCase();
  const items = Array.isArray(order?.items) ? order.items : [];
  const normalizedItems = items.map((item) => normalizeItemFulfillmentStatus(item?.fulfillmentStatus, ""));
  const nonCancelledItems = normalizedItems.filter(
    (itemStatus) => itemStatus && itemStatus !== "cancelled" && itemStatus !== "cancelled_by_admin"
  );

  if (status === "cancelled_by_admin" || (normalizedItems.length && normalizedItems.every((itemStatus) => itemStatus === "cancelled_by_admin"))) {
    return "cancelled_by_admin";
  }

  if (
    status === "cancelled" ||
    (normalizedItems.length &&
      normalizedItems.every((itemStatus) => itemStatus === "cancelled" || itemStatus === "cancelled_by_admin"))
  ) {
    return "cancelled";
  }

  if (normalizedItems.includes("return_requested")) return "return_requested";
  if (normalizedItems.includes("collection_scheduled")) return "collection_scheduled";
  if (normalizedItems.includes("return_in_transit")) return "return_in_transit";
  if (normalizedItems.includes("return_received")) return "return_received";
  if (normalizedItems.includes("refund_completed")) return "refund_completed";
  if (nonCancelledItems.length && nonCancelledItems.every((itemStatus) => itemStatus === "delivered")) return "delivered";

  if (!nonCancelledItems.length) {
    return normalizeItemFulfillmentStatus(order?.fulfillmentStatus, "processing");
  }

  const normalizedActiveItems = nonCancelledItems.map((itemStatus) => itemStatus === "unpacked" ? "packed" : itemStatus);
  if (normalizedActiveItems.every((itemStatus) => itemStatus === "shipped" || itemStatus === "delivered")) return "shipped";
  if (normalizedActiveItems.every((itemStatus) => itemStatus === "packed" || itemStatus === "shipped" || itemStatus === "delivered")) return "packed";
  return "processing";
}

export function resolveOrderPaymentStatus(order) {
  const fallback = normalizePaymentStatus(order?.paymentStatus, "paid");
  if (fallback === "payment_failed") return "payment_failed";
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return fallback;

  const normalizedItems = items.map((item) => normalizeItemFulfillmentStatus(item?.fulfillmentStatus, ""));
  const refundableCount = normalizedItems.filter((itemStatus) => REFUNDED_ITEM_STATUSES.includes(itemStatus)).length;
  const hasPendingRefund = normalizedItems.some((itemStatus) => RETURN_PENDING_ITEM_STATUSES.includes(itemStatus));

  if (hasPendingRefund) return "refund_pending";
  if (refundableCount === normalizedItems.length && refundableCount > 0) return "refunded";
  if (refundableCount > 0) return "partially_refunded";
  return fallback;
}

export function mapOrder(order) {
  const grandTotal = asNumber(order?.grandTotal, asNumber(order?.total, 0));
  const fulfillmentStatus = resolveOrderFulfillmentStatus(order);
  const paymentStatus = resolveOrderPaymentStatus(order);

  return {
    id: String(order?._id || ""),
    placedAt: order?.placedAt,
    status: normalizeString(
      order?.status,
      ["cancelled", "cancelled_by_admin"].includes(fulfillmentStatus) ? fulfillmentStatus : "placed"
    ),
    paymentStatus,
    fulfillmentStatus,
    itemCount: Number(order?.itemCount || 0),
    subtotal: asNumber(order?.subtotal, 0),
    discountTotal: asNumber(order?.discountTotal, 0),
    shippingTotal: asNumber(order?.shippingTotal, 0),
    taxTotal: asNumber(order?.taxTotal, 0),
    grandTotal,
    total: grandTotal,
    currency: normalizeString(order?.currency, "INR") || "INR",
    pricingVersion: asNumber(order?.pricingVersion, 1),
    couponCode: normalizeString(order?.couponCode),
    paymentReference: normalizeString(order?.paymentReference),
    addressSnapshot: order?.addressSnapshot
      ? {
          fullName: normalizeString(order.addressSnapshot.fullName),
          phone: normalizeString(order.addressSnapshot.phone),
          line1: normalizeString(order.addressSnapshot.line1),
          line2: normalizeString(order.addressSnapshot.line2),
          city: normalizeString(order.addressSnapshot.city),
          state: normalizeString(order.addressSnapshot.state),
          postalCode: normalizeString(order.addressSnapshot.postalCode),
          country: normalizeString(order.addressSnapshot.country),
        }
      : null,
    items: Array.isArray(order?.items)
      ? order.items.map((item, index) => ({
          id: buildOrderItemId(item, index),
          productId: item?.productId ? String(item.productId) : "",
          variantId: item?.variantId ? String(item.variantId) : "",
          categoryId: item?.categoryId ? String(item.categoryId) : "",
          categoryLabel: normalizeString(item?.categoryLabel),
          stockKey: normalizeString(item?.stockKey).toUpperCase(),
          slug: normalizeString(item?.slug),
          title: normalizeString(item?.title),
          imageUrl: normalizeString(item?.imageUrl),
          quantity: Number(item?.quantity || 0),
          fulfillmentStatus: normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "processing"),
          outboundTrackingNumber: normalizeString(item?.outboundTrackingNumber),
          collectionTrackingNumber: normalizeString(item?.collectionTrackingNumber),
          cancelRequestedAt: item?.cancelRequestedAt || null,
          unpackedAt: item?.unpackedAt || null,
          shippedAt: item?.shippedAt || null,
          deliveredAt: item?.deliveredAt || null,
          cancelledAt: item?.cancelledAt || null,
          adminCancelledAt: item?.adminCancelledAt || null,
          returnRequestedAt: item?.returnRequestedAt || null,
          collectionScheduledAt: item?.collectionScheduledAt || null,
          returnReceivedAt: item?.returnReceivedAt || null,
          refundCompletedAt: item?.refundCompletedAt || null,
          currency: normalizeString(item?.currency, order?.currency || "INR") || order?.currency || "INR",
          listUnitPrice: asNumber(item?.listUnitPrice, asNumber(item?.unitPrice, 0)),
          catalogDiscountType: normalizeString(item?.catalogDiscountType, "none") || "none",
          catalogDiscountValue: asNumber(item?.catalogDiscountValue, 0),
          catalogDiscountLabel: normalizeString(item?.catalogDiscountLabel),
          catalogDiscountAmount: asNumber(item?.catalogDiscountAmount, 0),
          promoDiscountType: normalizeString(item?.promoDiscountType, "none") || "none",
          promoDiscountValue: asNumber(item?.promoDiscountValue, 0),
          promoDiscountLabel: normalizeString(item?.promoDiscountLabel),
          promoDiscountAmount: asNumber(item?.promoDiscountAmount, 0),
          finalUnitPrice: asNumber(item?.finalUnitPrice, asNumber(item?.unitPrice, 0)),
          unitPrice: asNumber(item?.finalUnitPrice, asNumber(item?.unitPrice, 0)),
          lineSubtotal: asNumber(item?.lineSubtotal, 0),
          lineTaxTotal: asNumber(item?.lineTaxTotal, 0),
          lineShippingTotal: asNumber(item?.lineShippingTotal, 0),
          lineDiscountTotal: asNumber(item?.lineDiscountTotal, 0),
          lineGrandTotal: asNumber(item?.lineGrandTotal, asNumber(item?.lineTotal, 0)),
          lineTotal: asNumber(item?.lineGrandTotal, asNumber(item?.lineTotal, 0)),
        }))
      : [],
  };
}
