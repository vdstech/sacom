function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export function resolveOrderDisplayId(order) {
  const displayId = normalizeString(order?.displayId);
  if (displayId) return displayId;
  const paymentReference = normalizeString(order?.paymentReference);
  if (paymentReference) return paymentReference;
  const rawId = normalizeString(order?._id || order?.id);
  if (!rawId) return "";
  return `#${rawId.slice(-6).toUpperCase()}`;
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
  "manual_external_resolution",
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
export const ORDER_ITEM_SLA_STATUSES = ["ON_TRACK", "DELAYED", "VIOLATED"];
export const FULFILLMENT_DELAY_HOURS = 24;
export const FULFILLMENT_VIOLATION_HOURS = 48;
export const DEFAULT_TARGET_COMPLETION_HOURS = Math.max(
  1,
  Number.parseInt(process.env.ORDER_TARGET_COMPLETION_HOURS || "72", 10) || 72
);

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

export function normalizeSlaStatus(value, fallback = "ON_TRACK") {
  const normalized = normalizeString(value, fallback).toUpperCase();
  if (ORDER_ITEM_SLA_STATUSES.includes(normalized)) return normalized;
  return fallback;
}

function addHours(date, hours) {
  const base = date instanceof Date ? date : new Date(date || "");
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + (hours * 60 * 60 * 1000));
}

function getHoursSince(value, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value || "");
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, (now.getTime() - date.getTime()) / (60 * 60 * 1000));
}

export function resolveFulfillmentStage(item) {
  const status = normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED");
  const owner = normalizePhysicalOwner(item?.physicalOwner, "NONE");
  const pendingType = normalizeString(item?.pendingHandover?.type).toUpperCase();
  const pendingStatus = normalizeString(item?.pendingHandover?.status).toUpperCase();

  if (["RESERVED", "PICKED_FROM_WAREHOUSE"].includes(status)) return "Processing";
  if (["HANDED_TO_PACKAGING", "PACKAGING_RECEIVED", "PACKAGING_IN_PROGRESS", "PACKED"].includes(status)) return "Packaging";
  if (["HANDED_TO_SHIPPING", "SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(status)) return "Shipping";
  if (status === "SHIPPED" || status === "DELIVERED") return "Shipped";
  if (["HANDED_TO_CANCELLATION", "CANCELLATION_RECEIVED", ...FINAL_CANCELLATION_STATUSES].includes(status)) return "Cancellation";
  if (isReturnLaneStatus(status)) return "Return";
  if (status === "CANCEL_REQUESTED") {
    if (owner === "PROCESSING_MANAGER") return "Processing";
    if (owner === "PACKAGING_MANAGER") return "Packaging";
    if (owner === "SHIPPING_OPERATOR") return "Shipping";
    if (pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT") return "Shipping";
    return "Cancellation";
  }
  return "Other";
}

export function resolveFulfillmentLaneKey(item) {
  const stage = resolveFulfillmentStage(item);
  if (stage === "Processing") return "processing";
  if (stage === "Packaging") return "packaging";
  if (stage === "Shipping") return "shipping";
  if (stage === "Shipped") return "shipped";
  if (stage === "Cancellation") return "cancellation";
  if (stage === "Return") return "return";
  return "";
}

export function isTrackedFulfillmentLane(stageOrItem) {
  const stage = typeof stageOrItem === "string" ? stageOrItem : resolveFulfillmentStage(stageOrItem);
  return ["Processing", "Packaging", "Shipping"].includes(stage);
}

export function deriveTargetCompletionDate(item, orderPlacedAt) {
  const explicit = item?.targetCompletionDate ? new Date(item.targetCompletionDate) : null;
  if (explicit && !Number.isNaN(explicit.getTime())) return explicit;
  const placedAt = orderPlacedAt instanceof Date ? orderPlacedAt : new Date(orderPlacedAt || "");
  if (Number.isNaN(placedAt.getTime())) return null;
  return addHours(placedAt, DEFAULT_TARGET_COMPLETION_HOURS);
}

export function deriveLaneAssignedAt(item, orderPlacedAt) {
  const explicit = item?.laneAssignedAt ? new Date(item.laneAssignedAt) : null;
  if (explicit && !Number.isNaN(explicit.getTime())) return explicit;

  const stage = resolveFulfillmentStage(item);
  const candidateValues = stage === "Processing"
    ? [item?.pickedAt, orderPlacedAt]
    : stage === "Packaging"
      ? [item?.handedToPackagingAt, item?.packagingReceivedAt, orderPlacedAt]
      : stage === "Shipping"
        ? [item?.handedToShippingAt, item?.shippingReceivedAt, orderPlacedAt]
        : stage === "Shipped"
          ? [item?.shippedAt, item?.handedToShippingAt, orderPlacedAt]
          : stage === "Cancellation"
            ? [item?.handedToCancellationAt, item?.cancelRequestedAt, orderPlacedAt]
            : stage === "Return"
              ? [item?.returnRequestedAt, orderPlacedAt]
              : [orderPlacedAt];

  for (const value of candidateValues) {
    const date = value instanceof Date ? value : new Date(value || "");
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function deriveLastActionedAt(item, orderPlacedAt) {
  const explicit = item?.lastActionedAt ? new Date(item.lastActionedAt) : null;
  if (explicit && !Number.isNaN(explicit.getTime())) return explicit;

  const candidateValues = [
    item?.deliveredAt,
    item?.shippedAt,
    item?.trackingNumberEnteredAt,
    item?.courierAssignedAt,
    item?.shippingStartedAt,
    item?.shippingReceivedAt,
    item?.handedToShippingAt,
    item?.packedAt,
    item?.labelPrintedAt,
    item?.packageVerifiedAt,
    item?.packagingStartedAt,
    item?.packagingReceivedAt,
    item?.handedToPackagingAt,
    item?.pickedAt,
    item?.cancelRequestedAt,
    item?.cancellationReceivedAt,
    item?.cancellationClosedAt,
    item?.returnRequestedAt,
    item?.returnReceivedAt,
    item?.refundCompletedAt,
    orderPlacedAt,
  ];

  for (const value of candidateValues) {
    const date = value instanceof Date ? value : new Date(value || "");
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function resolveItemSlaStatus(item, {
  orderPlacedAt = null,
  now = new Date(),
  activeEscalation = null,
} = {}) {
  if (normalizeString(activeEscalation?.status).toUpperCase() === "OPEN") return "VIOLATED";

  const stage = resolveFulfillmentStage(item);
  if (!isTrackedFulfillmentLane(stage)) return "ON_TRACK";

  const laneAssignedAt = deriveLaneAssignedAt(item, orderPlacedAt);
  const lastActionedAt = deriveLastActionedAt(item, orderPlacedAt);
  const laneHours = laneAssignedAt ? getHoursSince(laneAssignedAt, now) : 0;
  const actionHours = lastActionedAt ? getHoursSince(lastActionedAt, now) : 0;

  if (laneHours >= FULFILLMENT_VIOLATION_HOURS) return "VIOLATED";
  if (actionHours >= FULFILLMENT_DELAY_HOURS) return "DELAYED";
  return normalizeSlaStatus(item?.slaStatus, "ON_TRACK");
}

export function getItemHoursInLane(item, { orderPlacedAt = null, now = new Date() } = {}) {
  const stage = resolveFulfillmentStage(item);
  if (!isTrackedFulfillmentLane(stage)) return 0;
  const laneAssignedAt = deriveLaneAssignedAt(item, orderPlacedAt);
  return laneAssignedAt ? Number(getHoursSince(laneAssignedAt, now).toFixed(2)) : 0;
}

export function getItemSlaSortPriority(item, { orderPlacedAt = null, now = new Date(), activeEscalation = null } = {}) {
  const status = resolveItemSlaStatus(item, { orderPlacedAt, now, activeEscalation });
  return status === "ON_TRACK" ? 1 : 0;
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
  // PARTIALLY_PACKED is an order-level rollup only. It means active items in the
  // same order have progressed into packaging or beyond, but not every active
  // item has reached PACKED yet. Individual order items should never use this
  // as their own fulfillment status.
  if (activeItems.some((status) => ["PACKAGING_RECEIVED", "PACKAGING_IN_PROGRESS", "PACKED", "HANDED_TO_SHIPPING", "SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(status))) {
    return activeItems.length > 1 ? "PARTIALLY_PACKED" : activeItems[0] === "PACKED" ? "PACKED" : "PARTIALLY_PACKED";
  }

  if (activeItems.length && activeItems.every((status) => status === "PICKED_FROM_WAREHOUSE")) return "PICKED";
  if (activeItems.some((status) => ["PICKED_FROM_WAREHOUSE", "HANDED_TO_PACKAGING"].includes(status))) return "PARTIALLY_PICKED";

  return "PLACED";
}

export function resolveOrderPaymentStatus(order) {
  const fallback = normalizePaymentStatus(order?.paymentStatus, "paid");
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

function mapEscalationSnapshot(item) {
  return item?.activeEscalation ? {
    id: String(item.activeEscalation._id || item.activeEscalation.id || ""),
    lane: normalizeString(item.activeEscalation.lane),
    responsibleOwner: normalizeString(item.activeEscalation.responsibleOwner),
    triggeredAt: item.activeEscalation.triggeredAt || null,
    hoursPending: asNumber(item.activeEscalation.hoursPending, 0),
    reason: normalizeString(item.activeEscalation.reason),
    status: normalizeString(item.activeEscalation.status),
    resolvedAt: item.activeEscalation.resolvedAt || null,
  } : null;
}

export function mapOrder(order, { now = new Date() } = {}) {
  const grandTotal = asNumber(order?.grandTotal, asNumber(order?.total, 0));
  const fulfillmentStatus = resolveOrderFulfillmentStatus(order);
  const paymentStatus = resolveOrderPaymentStatus(order);
  const placedAt = order?.placedAt || null;

  return {
    id: String(order?._id || ""),
    displayId: resolveOrderDisplayId(order),
    placedAt,
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
    pricingSnapshot: order?.pricingSnapshot || null,
    couponCode: normalizeString(order?.couponCode),
    couponDiscountTotal: asNumber(order?.couponDiscountTotal, 0),
    couponAppliedAmount: asNumber(order?.couponAppliedAmount, 0),
    couponForfeitedAmount: asNumber(order?.couponForfeitedAmount, 0),
    displayReference: resolveOrderDisplayId(order),
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
      currentLaneOwner: normalizePhysicalOwner(item?.physicalOwner, "NONE"),
      currentStage: resolveFulfillmentStage(item),
      cancellationSource: normalizeString(item?.cancellationSource),
      cancellationReason: normalizeString(item?.cancellationReason),
      packageVerificationStatus: normalizeString(item?.packageVerificationStatus, "PENDING"),
      labelStatus: normalizeString(item?.labelStatus, "NOT_PRINTED"),
      labelReprintCount: asNumber(item?.labelReprintCount, 0),
      labelReprintReason: normalizeString(item?.labelReprintReason),
      courierName: normalizeString(item?.courierName),
      outboundTrackingNumber: normalizeString(item?.outboundTrackingNumber),
      customerOrderedDate: placedAt,
      targetCompletionDate: deriveTargetCompletionDate(item, placedAt)?.toISOString() || null,
      laneAssignedAt: deriveLaneAssignedAt(item, placedAt)?.toISOString() || null,
      lastActionedAt: deriveLastActionedAt(item, placedAt)?.toISOString() || null,
      slaStatus: resolveItemSlaStatus(item, { orderPlacedAt: placedAt, now, activeEscalation: item?.activeEscalation }),
      hoursInLane: getItemHoursInLane(item, { orderPlacedAt: placedAt, now }),
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
      cancelledAt: item?.cancelledAt || null,
      cancellationReceivedAt: item?.cancellationReceivedAt || null,
      cancellationClosedAt: item?.cancellationClosedAt || null,
      pendingHandover: mapHandoverSnapshot(item),
      activeEscalation: mapEscalationSnapshot(item),
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
