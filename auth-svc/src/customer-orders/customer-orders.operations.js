import { buildOrderItemId, normalizeItemFulfillmentStatus } from "./customer-orders.shared.js";

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

export const ORDER_OPERATION_TABS = ["processing", "shipping", "shipped", "delivered"];
export const ORDER_OPERATION_SORTS = ["newest", "oldest", "price_desc", "price_asc"];

export function normalizeOrderOperationTab(value, fallback = "processing") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return ORDER_OPERATION_TABS.includes(normalized) ? normalized : fallback;
}

export function normalizeOrderOperationSort(value, fallback = "newest") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  return ORDER_OPERATION_SORTS.includes(normalized) ? normalized : fallback;
}

export function orderOperationTabMatchesItem(tab, item) {
  const normalizedTab = normalizeOrderOperationTab(tab, "");
  const status = normalizeItemFulfillmentStatus(item?.status || item?.fulfillmentStatus, "RESERVED");
  const owner = normalizeString(item?.physicalOwner).toUpperCase();
  const pendingType = normalizeString(item?.pendingHandover?.type).toUpperCase();
  const pendingStatus = normalizeString(item?.pendingHandover?.status).toUpperCase();

  if (normalizedTab === "processing") {
    return status === "RESERVED" ||
      status === "PICKED_FROM_WAREHOUSE" ||
      (status === "CANCEL_REQUESTED" && owner === "PROCESSING_MANAGER");
  }

  if (normalizedTab === "shipping") {
    return ["HANDED_TO_SHIPPING", "SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(status) ||
      (status === "CANCEL_REQUESTED" && owner === "SHIPPING_OPERATOR") ||
      (status === "CANCEL_REQUESTED" && pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT");
  }

  if (normalizedTab === "shipped") return status === "SHIPPED";
  if (normalizedTab === "delivered") return status === "DELIVERED";
  return false;
}

export function buildOrderOperationSummary(items = []) {
  return {
    processing: items.filter((item) => orderOperationTabMatchesItem("processing", item)).length,
    shipping: items.filter((item) => orderOperationTabMatchesItem("shipping", item)).length,
    shipped: items.filter((item) => orderOperationTabMatchesItem("shipped", item)).length,
    delivered: items.filter((item) => orderOperationTabMatchesItem("delivered", item)).length,
  };
}

export function getOrderOperationItemPrice(item) {
  const quantity = Math.max(1, Math.floor(asNumber(item?.quantity, 1)));
  const unitPrice = asNumber(item?.unitPrice, Number.NaN);
  if (Number.isFinite(unitPrice) && unitPrice > 0) return Math.max(0, Math.round(unitPrice));
  const linePrice = asNumber(item?.lineGrandTotal, asNumber(item?.lineTotal, 0));
  return Math.max(0, Math.round(linePrice / quantity));
}

export function getOrderOperationItemLastUpdatedAt(item, orderUpdatedAt = null) {
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
    item?.updatedAt,
    orderUpdatedAt,
  ];

  let latest = null;
  for (const value of candidateValues) {
    const date = asDate(value);
    if (!date) continue;
    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }

  return latest ? latest.toISOString() : null;
}

export function buildOrderOperationSearchPattern(search = "") {
  const value = normalizeString(search);
  if (!value) return null;
  return new RegExp(escapeRegExp(value), "i");
}

export function matchesOrderOperationSearch(item, pattern) {
  if (!pattern) return true;
  return pattern.test(normalizeString(item?.orderId)) ||
    pattern.test(normalizeString(item?.productName)) ||
    pattern.test(normalizeString(item?.sku || item?.stockKey)) ||
    pattern.test(normalizeString(item?.customerName)) ||
    pattern.test(normalizeString(item?.courierName)) ||
    pattern.test(normalizeString(item?.trackingNumber));
}

function compareDatesDesc(left, right) {
  const leftDate = asDate(left);
  const rightDate = asDate(right);
  const leftTime = leftDate ? leftDate.getTime() : 0;
  const rightTime = rightDate ? rightDate.getTime() : 0;
  return rightTime - leftTime;
}

export function filterOrderOperationItems(items = [], options = {}) {
  const tab = normalizeOrderOperationTab(options.tab, "processing");
  const sort = normalizeOrderOperationSort(options.sort, "newest");
  const normalizedCourier = normalizeString(options.courier).toLowerCase();
  const statusFilters = normalizeString(options.status)
    .split(",")
    .map((value) => normalizeItemFulfillmentStatus(value, ""))
    .filter(Boolean);
  const searchPattern = buildOrderOperationSearchPattern(options.search);

  const filtered = items.filter((item) => {
    if (!orderOperationTabMatchesItem(tab, item)) return false;
    if (statusFilters.length && !statusFilters.includes(normalizeItemFulfillmentStatus(item?.status || item?.fulfillmentStatus, ""))) {
      return false;
    }
    if (tab === "shipped" && normalizedCourier && !normalizeString(item?.courierName).toLowerCase().includes(normalizedCourier)) return false;
    if (!matchesOrderOperationSearch(item, searchPattern)) return false;
    return true;
  });

  filtered.sort((left, right) => {
    if (sort === "price_desc") {
      const priceDelta = asNumber(right.productPrice, 0) - asNumber(left.productPrice, 0);
      if (priceDelta !== 0) return priceDelta;
      return compareDatesDesc(left.createdAt, right.createdAt);
    }
    if (sort === "price_asc") {
      const priceDelta = asNumber(left.productPrice, 0) - asNumber(right.productPrice, 0);
      if (priceDelta !== 0) return priceDelta;
      return compareDatesDesc(left.createdAt, right.createdAt);
    }
    if (sort === "oldest") {
      return compareDatesDesc(right.createdAt, left.createdAt);
    }
    return compareDatesDesc(left.createdAt, right.createdAt);
  });

  return filtered;
}

export function paginateOrderOperationItems(items = [], { page = 1, limit = 25 } = {}) {
  const safePage = Math.max(1, Math.floor(asNumber(page, 1)));
  const safeLimit = Math.max(1, Math.floor(asNumber(limit, 25)));
  const total = items.length;
  const paginatedItems = items.slice((safePage - 1) * safeLimit, safePage * safeLimit);

  return {
    items: paginatedItems,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: total ? Math.ceil(total / safeLimit) : 1,
  };
}

export function buildOrderOperationItem(order, item, index = 0) {
  return {
    orderId: String(order?._id || ""),
    orderItemId: buildOrderItemId(item, index),
    productId: item?.productId ? String(item.productId) : "",
    slug: normalizeString(item?.slug),
    productName: normalizeString(item?.title, "Product"),
    sku: normalizeString(item?.stockKey),
    stockKey: normalizeString(item?.stockKey),
    productPrice: getOrderOperationItemPrice(item),
    quantity: Math.max(1, Math.floor(asNumber(item?.quantity, 1))),
    status: normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED"),
    customerName: normalizeString(order?.addressSnapshot?.fullName),
    customerContact: normalizeString(order?.addressSnapshot?.phone),
    shippingAddress: order?.addressSnapshot || null,
    physicalOwner: normalizeString(item?.physicalOwner).toUpperCase(),
    courierName: normalizeString(item?.courierName),
    trackingNumber: normalizeString(item?.outboundTrackingNumber),
    createdAt: order?.placedAt || null,
    lastUpdatedAt: getOrderOperationItemLastUpdatedAt(item, order?.updatedAt || null),
    shippedAt: item?.shippedAt || null,
    deliveredAt: item?.deliveredAt || null,
    deliveredBy: item?.deliveredBy ? String(item.deliveredBy) : "",
    pendingHandover: item?.pendingHandover || null,
  };
}
