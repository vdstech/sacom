import mongoose from "mongoose";
import CustomerOrder from "./customer-orders.model.js";
import PhysicalHandover from "./customer-orders.handover.model.js";
import CancellationCase from "./customer-orders.cancellation-case.model.js";
import StorefrontCategoryRead from "./customer-orders.storefront-category.model.js";
import StorefrontProductRead from "./customer-orders.storefront-product.model.js";
import {
  buildOrderOperationItem,
  buildOrderOperationSummary,
  filterOrderOperationItems,
  normalizeOrderOperationTab,
  paginateOrderOperationItems,
} from "./customer-orders.operations.js";
import {
  buildOrderItemId,
  CANCELLATION_QUEUE_STATUSES,
  FINAL_CANCELLATION_STATUSES,
  mapOrder,
  normalizeItemFulfillmentStatus,
  normalizePaymentStatus,
  PACKAGING_QUEUE_STATUSES,
  PROCESSING_QUEUE_STATUSES,
  resolveOrderDisplayId,
  resolveOrderFulfillmentStatus,
  resolveOrderPaymentStatus,
  SHIPPING_QUEUE_STATUSES,
} from "./customer-orders.shared.js";
import {
  assignShipmentCourier,
  assignShipmentTrackingNumber,
  acceptReturnExchangeCase,
  confirmCancellationReceipt,
  createReturnExchangePlaceholder,
  generateExchangeCoupon,
  handoverOrderItemToCancellation,
  handoverOrderItemToPackaging,
  handoverOrderItemToShipping,
  listReturnExchangeCases,
  markCancelledOrderItemDamaged,
  markCancelledOrderItemLost,
  markOrderItemDelivered,
  markOrderItemPacked,
  markOrderItemShipped,
  packagingConfirmReceipt,
  packagingRejectReceipt,
  pickProcessingOrderItem,
  printShippingLabel,
  receiveReturnExchangeCase,
  rejectReturnExchangeCase,
  reprintShippingLabel,
  restockCancelledOrderItem,
  routeAdminOrderItemCancellation,
  shippingConfirmReceipt,
  shippingRejectReceipt,
  startReturnExchangeInvestigation,
  startPackagingOrderItem,
  startShippingOrderItem,
  updateReturnExchangeTracking,
  verifyPackageOrderItem,
} from "./customer-orders.service.js";

const CANCELLED_ITEM_STATUSES = new Set(FINAL_CANCELLATION_STATUSES);
const REVENUE_PAYMENT_STATUSES = new Set(["paid", "refund_pending", "partially_refunded", "refunded"]);
const DASHBOARD_RANGE_PRESETS = {
  today: { label: "Today", days: 1, granularity: "day" },
  this_week: { label: "This week", granularity: "day" },
  "7d": { label: "Last 7 days", days: 7, granularity: "day" },
  this_month: { label: "This month", granularity: "day" },
  "30d": { label: "Last 30 days", days: 30, granularity: "week" },
  this_year: { label: "This year", granularity: "month" },
};
const DASHBOARD_STATUS_ORDER = [
  "PLACED",
  "PARTIALLY_PICKED",
  "PICKED",
  "PACKED",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "PARTIALLY_CANCELLED",
  "CANCELLED",
];
const DASHBOARD_HIDDEN_STATUSES = new Set(["PARTIALLY_PACKED"]);
const PENDING_ORDER_STATUSES = new Set([
  "PLACED",
  "PARTIALLY_PICKED",
  "PICKED",
  "PARTIALLY_PACKED",
  "PACKED",
  "PARTIALLY_SHIPPED",
  "PARTIALLY_CANCELLED",
]);

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bucketDay(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bucketMonth(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function bucketQuarter(date) {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

function bucketWeek(date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - day + 1);
  return bucketDay(utcDate);
}

function addTimeBucket(target, key, deltaCount, deltaRevenue = 0) {
  if (!target.has(key)) target.set(key, { period: key, count: 0, revenue: 0 });
  const entry = target.get(key);
  entry.count += deltaCount;
  entry.revenue += deltaRevenue;
}

function mapTimeBuckets(target, { includeRevenue = false } = {}) {
  return Array.from(target.values())
    .sort((left, right) => right.period.localeCompare(left.period))
    .map((entry) => includeRevenue ? entry : { period: entry.period, count: entry.count });
}

function addTopMetric(target, key, label, quantity, revenue = 0) {
  if (!key) return;
  if (!target.has(key)) target.set(key, { id: key, label, count: 0, revenue: 0 });
  const entry = target.get(key);
  entry.count += quantity;
  entry.revenue += revenue;
  if (label && !entry.label) entry.label = label;
}

function topMetrics(target) {
  return Array.from(target.values())
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (right.revenue !== left.revenue) return right.revenue - left.revenue;
      return String(left.label || "").localeCompare(String(right.label || ""));
    })
    .slice(0, 10);
}

async function buildAnalyticsLookupMaps(orders = []) {
  const fallbackProductIds = new Set();
  const fallbackCategoryIds = new Set();

  for (const order of orders) {
    for (const item of order.items || []) {
      const productId = String(item?.productId || "").trim();
      const categoryId = String(item?.categoryId || "").trim();
      const categoryLabel = normalizeString(item?.categoryLabel);

      if (!categoryLabel && productId && mongoose.isValidObjectId(productId)) {
        fallbackProductIds.add(productId);
      }
      if (categoryId && mongoose.isValidObjectId(categoryId)) {
        fallbackCategoryIds.add(categoryId);
      }
    }
  }

  const products = fallbackProductIds.size
    ? await StorefrontProductRead.find({ _id: { $in: Array.from(fallbackProductIds) } })
      .select("_id title categoryId")
      .lean()
    : [];

  for (const product of products) {
    const categoryId = String(product?.categoryId || "").trim();
    if (categoryId && mongoose.isValidObjectId(categoryId)) fallbackCategoryIds.add(categoryId);
  }

  const categories = fallbackCategoryIds.size
    ? await StorefrontCategoryRead.find({ _id: { $in: Array.from(fallbackCategoryIds) } })
      .select("_id slug")
      .lean()
    : [];

  const productMap = new Map(
    products.map((product) => [String(product._id), {
      title: normalizeString(product?.title, "Product"),
      categoryId: String(product?.categoryId || "").trim(),
    }])
  );
  const categoryMap = new Map(
    categories.map((category) => [String(category._id), normalizeString(category?.slug, "uncategorized") || "uncategorized"])
  );

  return { productMap, categoryMap };
}

function getItemRevenue(item) {
  return asNumber(item?.lineGrandTotal, asNumber(item?.lineTotal, 0));
}

function getCategorySnapshot(item, maps) {
  const productId = String(item?.productId || "").trim();
  const mappedProduct = productId ? maps.productMap.get(productId) || null : null;
  const categoryId = String(item?.categoryId || mappedProduct?.categoryId || "").trim();
  const categoryLabel = normalizeString(item?.categoryLabel) || maps.categoryMap.get(categoryId) || "uncategorized";
  return {
    id: categoryId || "uncategorized",
    label: categoryLabel,
  };
}

function getProductSnapshot(item) {
  const productId = String(item?.productId || "").trim();
  return {
    id: productId || buildOrderItemId(item),
    label: normalizeString(item?.title, "Product"),
  };
}

function getActorId(req) {
  return normalizeString(req.auth?.userId);
}

export function normalizeDashboardRange(value) {
  const candidate = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DASHBOARD_RANGE_PRESETS, candidate) ? candidate : "30d";
}

export function resolveDashboardWindow(query = {}, now = new Date()) {
  const defaultRange = normalizeDashboardRange(query.range);
  const customFrom = asDate(query.from);
  const customTo = asDate(query.to);

  if (customFrom && customTo) {
    const start = new Date(Date.UTC(customFrom.getUTCFullYear(), customFrom.getUTCMonth(), customFrom.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(customTo.getUTCFullYear(), customTo.getUTCMonth(), customTo.getUTCDate(), 23, 59, 59, 999));
    if (start.getTime() <= end.getTime()) {
      const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
      return {
        key: "custom",
        label: `${bucketDay(start)} to ${bucketDay(end)}`,
        from: start.toISOString(),
        to: end.toISOString(),
        days: diffDays,
        granularity: diffDays > 90 ? "month" : diffDays > 31 ? "week" : "day",
      };
    }
  }

  const preset = DASHBOARD_RANGE_PRESETS[defaultRange];
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  let start = new Date(end);

  if (defaultRange === "today") {
    start.setUTCHours(0, 0, 0, 0);
  } else if (defaultRange === "this_week") {
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    start.setUTCHours(0, 0, 0, 0);
  } else if (defaultRange === "this_month") {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  } else if (defaultRange === "this_year") {
    start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  } else {
    start.setUTCDate(start.getUTCDate() - preset.days + 1);
    start.setUTCHours(0, 0, 0, 0);
  }

  const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

  return {
    key: defaultRange,
    label: preset.label,
    from: start.toISOString(),
    to: end.toISOString(),
    days: diffDays,
    granularity: preset.granularity,
  };
}

function isWithinDashboardWindow(date, window) {
  if (!date || !window) return false;
  const time = date.getTime();
  return time >= Date.parse(window.from) && time <= Date.parse(window.to);
}

function buildTrendBuckets(trendMap, granularity) {
  return Array.from(trendMap.values())
    .sort((left, right) => left.period.localeCompare(right.period))
    .map((entry) => ({
      period: entry.period,
      label: entry.period,
      orders: entry.orders,
      revenue: entry.revenue,
      granularity,
    }));
}

function addTrendPoint(target, key, deltaOrders, deltaRevenue = 0) {
  if (!target.has(key)) target.set(key, { period: key, orders: 0, revenue: 0 });
  const entry = target.get(key);
  entry.orders += deltaOrders;
  entry.revenue += deltaRevenue;
}

function buildStatusCounts(statusMap) {
  const preferred = DASHBOARD_STATUS_ORDER
    .filter((status) => statusMap.has(status) && !DASHBOARD_HIDDEN_STATUSES.has(status))
    .map((status) => ({ key: status, label: status, count: statusMap.get(status) || 0 }));
  const remaining = Array.from(statusMap.entries())
    .filter(([status]) => !DASHBOARD_STATUS_ORDER.includes(status) && !DASHBOARD_HIDDEN_STATUSES.has(status))
    .sort((left, right) => right[1] - left[1])
    .map(([status, count]) => ({ key: status, label: status, count }));
  return [...preferred, ...remaining];
}

function countOrdersForLane(orders, lane) {
  return orders.filter((order) => (order.items || []).some((item) => laneMatchesItem(lane, item))).length;
}

function createUtcBoundary(year, month, day = 1, endOfDay = false) {
  return new Date(Date.UTC(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
}

function buildPeriodComparisonWindow(now, period) {
  const currentEnd = createUtcBoundary(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), true);
  let currentStart;
  let previousStart;
  let previousEnd;

  if (period === "week") {
    const day = currentEnd.getUTCDay() || 7;
    currentStart = createUtcBoundary(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1);
    previousEnd = new Date(currentStart.getTime() - 1);
    previousStart = createUtcBoundary(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth(), previousEnd.getUTCDate() - 6);
  } else if (period === "month") {
    currentStart = createUtcBoundary(now.getUTCFullYear(), now.getUTCMonth(), 1);
    previousEnd = new Date(currentStart.getTime() - 1);
    previousStart = createUtcBoundary(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth(), 1);
  } else {
    currentStart = createUtcBoundary(now.getUTCFullYear(), 0, 1);
    previousEnd = new Date(currentStart.getTime() - 1);
    previousStart = createUtcBoundary(previousEnd.getUTCFullYear(), 0, 1);
  }

  return { currentStart, currentEnd, previousStart, previousEnd };
}

function aggregateRevenueForPeriod(orders, start, end) {
  const result = { revenue: 0, orders: 0 };
  for (const order of orders) {
    const placedAt = asDate(order?.placedAt);
    if (!placedAt) continue;
    const time = placedAt.getTime();
    if (time < start.getTime() || time > end.getTime()) continue;
    const paymentStatus = normalizePaymentStatus(order?.paymentStatus, "pending");
    if (!REVENUE_PAYMENT_STATUSES.has(paymentStatus)) continue;
    result.orders += 1;
    result.revenue += asNumber(order?.grandTotal, asNumber(order?.total, 0));
  }
  return result;
}

function buildComparison(orders, now, period) {
  const { currentStart, currentEnd, previousStart, previousEnd } = buildPeriodComparisonWindow(now, period);
  const current = aggregateRevenueForPeriod(orders, currentStart, currentEnd);
  const previous = aggregateRevenueForPeriod(orders, previousStart, previousEnd);
  const previousRevenue = previous.revenue;
  const changeRevenuePct = previousRevenue > 0
    ? ((current.revenue - previousRevenue) / previousRevenue) * 100
    : current.revenue > 0
      ? 100
      : 0;
  const previousOrders = previous.orders;
  const changeOrdersPct = previousOrders > 0
    ? ((current.orders - previousOrders) / previousOrders) * 100
    : current.orders > 0
      ? 100
      : 0;

  return {
    period,
    current,
    previous,
    delta: {
      revenue: current.revenue - previous.revenue,
      orders: current.orders - previous.orders,
      revenuePct: Number(changeRevenuePct.toFixed(2)),
      ordersPct: Number(changeOrdersPct.toFixed(2)),
    },
  };
}

function buildCurrentYearMonthlyTrend(orders, now) {
  const trend = new Map();
  const year = now.getUTCFullYear();

  for (const order of orders) {
    const placedAt = asDate(order?.placedAt);
    if (!placedAt || placedAt.getUTCFullYear() !== year) continue;
    const paymentStatus = normalizePaymentStatus(order?.paymentStatus, "pending");
    const revenue = REVENUE_PAYMENT_STATUSES.has(paymentStatus)
      ? asNumber(order?.grandTotal, asNumber(order?.total, 0))
      : 0;
    addTrendPoint(trend, bucketMonth(placedAt), 1, revenue);
  }

  const points = [];
  for (let month = 0; month < 12; month += 1) {
    const date = new Date(Date.UTC(year, month, 1));
    const period = bucketMonth(date);
    const entry = trend.get(period) || { orders: 0, revenue: 0 };
    points.push({
      period,
      label: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(date),
      orders: entry.orders,
      revenue: entry.revenue,
      granularity: "month",
    });
  }
  return points;
}

function buildSelectedRangeWeeklyTrend(orders, window) {
  const trend = new Map();
  for (const order of orders) {
    const placedAt = asDate(order?.placedAt);
    if (!isWithinDashboardWindow(placedAt, window)) continue;
    const paymentStatus = normalizePaymentStatus(order?.paymentStatus, "pending");
    const revenue = REVENUE_PAYMENT_STATUSES.has(paymentStatus)
      ? asNumber(order?.grandTotal, asNumber(order?.total, 0))
      : 0;
    addTrendPoint(trend, bucketWeek(placedAt), 1, revenue);
  }

  const points = [];
  const start = new Date(window.from);
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(window.to);

  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 7)) {
    const period = bucketWeek(cursor);
    const entry = trend.get(period) || { orders: 0, revenue: 0 };
    points.push({
      period,
      label: period,
      orders: entry.orders,
      revenue: entry.revenue,
      granularity: "week",
    });
  }

  return points;
}

export function buildOrdersDashboardPayload(orders = [], { query = {}, now = new Date() } = {}) {
  const window = resolveDashboardWindow(query, now);
  const trend = new Map();
  const statusCounts = new Map();
  const topSellingProducts = new Map();
  const recentOrders = [];

  const currentSummary = {
    processing: countOrdersForLane(orders, "processing"),
    packaging: countOrdersForLane(orders, "packaging"),
    shipping: countOrdersForLane(orders, "shipping"),
    cancellations: countOrdersForLane(orders, "cancellations"),
    shipped: orders.filter((order) => resolveOrderFulfillmentStatus(order) === "SHIPPED").length,
    cancelled: orders.filter((order) => resolveOrderFulfillmentStatus(order) === "CANCELLED").length,
    total: orders.length,
  };

  const totals = {
    revenue: 0,
    orders: 0,
    paidOrders: 0,
    cancelledOrders: 0,
    partiallyShippedOrders: 0,
    pendingOrders: 0,
  };

  for (const order of orders) {
    const placedAt = asDate(order?.placedAt);
    if (!isWithinDashboardWindow(placedAt, window)) continue;

    const paymentStatus = normalizePaymentStatus(order?.paymentStatus, "pending");
    const orderStatus = resolveOrderFulfillmentStatus(order);
    const revenue = asNumber(order?.grandTotal, asNumber(order?.total, 0));
    const bucketKey = window.granularity === "month"
      ? bucketMonth(placedAt)
      : window.granularity === "week"
        ? bucketWeek(placedAt)
        : bucketDay(placedAt);

    totals.orders += 1;
    if (orderStatus === "CANCELLED") totals.cancelledOrders += 1;
    if (orderStatus === "PARTIALLY_SHIPPED") totals.partiallyShippedOrders += 1;
    if (PENDING_ORDER_STATUSES.has(orderStatus)) totals.pendingOrders += 1;
    statusCounts.set(orderStatus, (statusCounts.get(orderStatus) || 0) + 1);

    if (REVENUE_PAYMENT_STATUSES.has(paymentStatus)) {
      totals.paidOrders += 1;
      totals.revenue += revenue;
      addTrendPoint(trend, bucketKey, 1, revenue);
    } else {
      addTrendPoint(trend, bucketKey, 1, 0);
    }

    if (recentOrders.length < 8) {
      recentOrders.push({
        id: String(order?._id || ""),
        displayId: resolveOrderDisplayId(order),
        placedAt: order?.placedAt || null,
        customerName: normalizeString(order?.addressSnapshot?.fullName, "Customer"),
        itemCount: Math.max(0, asNumber(order?.itemCount, Array.isArray(order?.items) ? order.items.length : 0)),
        amount: revenue,
        currency: normalizeString(order?.currency, "INR"),
        paymentStatus,
        fulfillmentStatus: orderStatus,
      });
    }

    for (const item of order.items || []) {
      const quantity = Math.max(0, Math.floor(asNumber(item?.quantity, 0)));
      const itemRevenue = getItemRevenue(item);
      const itemStatus = normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED");
      if (CANCELLED_ITEM_STATUSES.has(itemStatus)) continue;

      const product = getProductSnapshot(item);
      addTopMetric(topSellingProducts, product.id, product.label, quantity, itemRevenue);
    }
  }

  const actionRequired = [
    { key: "processing", label: "Processing queue", count: currentSummary.processing, href: "/admin/orders/processing" },
    { key: "packaging", label: "Packaging queue", count: currentSummary.packaging, href: "/admin/orders/packaging" },
    { key: "shipping", label: "Shipping queue", count: currentSummary.shipping, href: "/admin/orders/shipping" },
    { key: "cancellations", label: "Cancellation queue", count: currentSummary.cancellations, href: "/admin/orders/cancellations" },
  ];

  return {
    range: window,
    summary: currentSummary,
    kpis: {
      revenue: totals.revenue,
      orders: totals.orders,
      averageOrderValue: totals.paidOrders ? totals.revenue / totals.paidOrders : 0,
      pendingOrders: totals.pendingOrders,
      cancelledOrders: totals.cancelledOrders,
    },
    salesTrend: {
      granularity: window.granularity,
      points: buildTrendBuckets(trend, window.granularity),
    },
    weeklySalesTrend: buildSelectedRangeWeeklyTrend(orders, window),
    currentYearMonthlyTrend: buildCurrentYearMonthlyTrend(orders, now),
    comparisons: {
      weekly: buildComparison(orders, now, "week"),
      monthly: buildComparison(orders, now, "month"),
      yearly: buildComparison(orders, now, "year"),
    },
    ordersByStatus: buildStatusCounts(statusCounts),
    partiallyShipped: {
      supported: true,
      count: totals.partiallyShippedOrders,
      definition: "Orders with at least one shipped or delivered item while other items in the same order are still pending fulfillment.",
    },
    recentOrders,
    topSellingProducts: topMetrics(topSellingProducts),
    actionRequired,
  };
}

function buildSearchRegex(query = {}) {
  const search = normalizeString(query.search);
  if (!search) return null;
  return new RegExp(escapeRegExp(search), "i");
}

function matchesSearch(order, pattern) {
  if (!pattern) return true;
  if (pattern.test(normalizeString(order?.paymentReference))) return true;
  if (pattern.test(normalizeString(order?.addressSnapshot?.fullName))) return true;
  return (order.items || []).some((item) => (
    pattern.test(normalizeString(item?.title)) ||
    pattern.test(normalizeString(item?.stockKey)) ||
    pattern.test(normalizeString(item?.outboundTrackingNumber)) ||
    pattern.test(normalizeString(item?.courierName))
  ));
}

export function laneMatchesItem(lane, item) {
  const status = normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED");
  const owner = normalizeString(item?.physicalOwner).toUpperCase();
  const pendingType = normalizeString(item?.pendingHandover?.type).toUpperCase();
  const pendingStatus = normalizeString(item?.pendingHandover?.status).toUpperCase();

  if (lane === "processing") {
    return status === "RESERVED" ||
      (status === "PICKED_FROM_WAREHOUSE" && owner === "PROCESSING_MANAGER") ||
      (status === "HANDED_TO_PACKAGING" && owner === "PROCESSING_MANAGER") ||
      (status === "CANCEL_REQUESTED" && owner === "PROCESSING_MANAGER");
  }

  if (lane === "packaging") {
    return ["HANDED_TO_PACKAGING", "PACKAGING_RECEIVED", "PACKAGING_IN_PROGRESS", "PACKED", "HANDED_TO_SHIPPING"].includes(status) ||
      (
        status === "CANCEL_REQUESTED" &&
        owner === "PACKAGING_MANAGER" &&
        !(pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT")
      );
  }

  if (lane === "shipping") {
    return SHIPPING_QUEUE_STATUSES.includes(status) ||
      (status === "CANCEL_REQUESTED" && (
        owner === "SHIPPING_OPERATOR" ||
        (pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT")
      ));
  }

  if (lane === "cancellations") {
    return ["HANDED_TO_CANCELLATION", "CANCELLATION_RECEIVED"].includes(status);
  }

  return true;
}

function assertSystemAdminAccess(req) {
  const systemLevel = normalizeString(req.auth?.systemLevel).toUpperCase();
  if (systemLevel === "ADMIN" || systemLevel === "SUPER") return systemLevel;
  throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
}

function attachPendingArtifacts(order, handoversByItem, cancellationCasesByItem) {
  return {
    ...order,
    items: (order.items || []).map((item, index) => {
      const itemId = buildOrderItemId(item, index);
      const handover = handoversByItem.get(itemId) || null;
      const caseDoc = cancellationCasesByItem.get(itemId) || null;
      return {
        ...item,
        pendingHandover: handover ? {
          type: handover.type,
          status: handover.status,
          fromOwner: handover.fromOwner,
          toOwner: handover.toOwner,
          handedOverAt: handover.handedOverAt,
          handedOverBy: String(handover.handedOverByUserId || ""),
          rejectionReason: handover.rejectionReason || "",
        } : null,
        activeCancellationCase: caseDoc ? {
          source: caseDoc.source,
          status: caseDoc.status,
          reason: caseDoc.reason || "",
        } : null,
      };
    }),
  };
}

async function enrichOrders(orders = []) {
  const itemIds = orders.flatMap((order) => (order.items || []).map((item, index) => buildOrderItemId(item, index)));
  if (!itemIds.length) return orders;

  const [handovers, cancellationCases] = await Promise.all([
    PhysicalHandover.find({ orderItemId: { $in: itemIds }, status: { $in: ["PENDING_RECEIPT", "RECEIVED", "REJECTED"] } })
      .sort({ createdAt: -1 })
      .lean(),
    CancellationCase.find({ orderItemId: { $in: itemIds }, status: "OPEN" }).lean(),
  ]);

  const handoversByItem = new Map();
  for (const handover of handovers) {
    if (!handoversByItem.has(handover.orderItemId)) handoversByItem.set(handover.orderItemId, handover);
  }
  const cancellationCasesByItem = new Map(cancellationCases.map((caseDoc) => [caseDoc.orderItemId, caseDoc]));

  return orders.map((order) => attachPendingArtifacts(order, handoversByItem, cancellationCasesByItem));
}

async function loadOrdersForLane({ lane = "overview", query = {} }) {
  const page = normalizePositiveInteger(query.page, 1);
  const limit = normalizePositiveInteger(query.limit, 25);
  const paymentStatusFilter = normalizePaymentStatus(query.paymentStatus, "");
  const orderStatusFilter = normalizeString(query.orderStatus)
    .split(",")
    .map((value) => normalizeString(value).toUpperCase())
    .filter(Boolean);
  const stateFilter = normalizeString(query.fulfillmentStatus)
    .split(",")
    .map((value) => normalizeItemFulfillmentStatus(value, ""))
    .filter(Boolean);
  const stockKeyFilter = normalizeString(query.stockKey).toUpperCase();
  const searchPattern = buildSearchRegex(query);

  const orders = await CustomerOrder.find({})
    .sort({ placedAt: -1, createdAt: -1 })
    .lean();

  let filteredOrders = orders.filter((order) => {
    if (paymentStatusFilter && normalizePaymentStatus(order?.paymentStatus, "") !== paymentStatusFilter) return false;
    if (!matchesSearch(order, searchPattern)) return false;
    return true;
  });

  filteredOrders = await enrichOrders(filteredOrders);
  if (orderStatusFilter.length) {
    filteredOrders = filteredOrders.filter((order) => orderStatusFilter.includes(resolveOrderFulfillmentStatus(order)));
  }

  const laneFilteredOrders = filteredOrders
    .map((order) => {
      const nextItems = (order.items || []).filter((item) => {
        if (stockKeyFilter && normalizeString(item?.stockKey).toUpperCase() !== stockKeyFilter) return false;
        const status = normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED");
        if (stateFilter.length && !stateFilter.includes(status)) return false;
        return laneMatchesItem(lane, item);
      });
      if (!nextItems.length) return null;
      return {
        ...order,
        items: nextItems,
        itemCount: nextItems.reduce((sum, item) => sum + asNumber(item?.quantity, 0), 0),
        grandTotal: nextItems.reduce((sum, item) => sum + asNumber(item?.lineGrandTotal, asNumber(item?.lineTotal, 0)), 0),
        total: nextItems.reduce((sum, item) => sum + asNumber(item?.lineGrandTotal, asNumber(item?.lineTotal, 0)), 0),
      };
    })
    .filter(Boolean);

  const total = laneFilteredOrders.length;
  const paginated = laneFilteredOrders.slice((page - 1) * limit, page * limit);
  return {
    items: paginated.map(mapOrder),
    total,
    page,
    limit,
    totalPages: total ? Math.ceil(total / limit) : 1,
  };
}

async function loadOrderOperationsItems(query = {}) {
  const page = normalizePositiveInteger(query.page, 1);
  const limit = normalizePositiveInteger(query.limit, 25);
  const orders = await CustomerOrder.find({})
    .sort({ placedAt: -1, createdAt: -1 })
    .lean();

  const enrichedOrders = await enrichOrders(orders);
  const operationItems = enrichedOrders.flatMap((order) =>
    (order.items || []).map((item, index) => buildOrderOperationItem(order, item, index))
  );
  const summary = buildOrderOperationSummary(operationItems);
  const filteredItems = filterOrderOperationItems(operationItems, {
    tab: normalizeOrderOperationTab(query.tab, "processing"),
    search: query.search,
    status: query.status,
    courier: query.courier,
    sort: query.sort,
  });
  const paginated = paginateOrderOperationItems(filteredItems, { page, limit });

  return {
    summary,
    ...paginated,
  };
}

async function fetchAndMapOrder(orderId) {
  const order = await CustomerOrder.findById(orderId).lean();
  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  const enriched = await enrichOrders([order]);
  return mapOrder(enriched[0]);
}

export async function listOrders(req, res) {
  try {
    const payload = await loadOrdersForLane({ lane: "overview", query: req.query || {} });
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list orders" });
  }
}

export async function listOrderOperationsItems(req, res) {
  try {
    assertSystemAdminAccess(req);
    return res.json(await loadOrderOperationsItems(req.query || {}));
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Failed to load order operations dashboard items" });
  }
}

export async function listProcessingQueue(req, res) {
  try {
    return res.json(await loadOrdersForLane({ lane: "processing", query: req.query || {} }));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load processing queue" });
  }
}

export async function listPackagingQueue(req, res) {
  try {
    return res.json(await loadOrdersForLane({ lane: "packaging", query: req.query || {} }));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load packaging queue" });
  }
}

export async function listShippingQueue(req, res) {
  try {
    return res.json(await loadOrdersForLane({ lane: "shipping", query: req.query || {} }));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load shipping queue" });
  }
}

export async function listCancellationQueue(req, res) {
  try {
    return res.json(await loadOrdersForLane({ lane: "cancellations", query: req.query || {} }));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load cancellation queue" });
  }
}

export async function listReturnExchangeQueue(req, res) {
  try {
    const page = normalizePositiveInteger(req.query?.page, 1);
    const limit = normalizePositiveInteger(req.query?.limit, 25);
    const cases = await listReturnExchangeCases({
      kind: req.query?.kind,
      status: req.query?.status,
      search: req.query?.search,
    });
    const total = cases.length;
    const items = cases.slice((page - 1) * limit, page * limit);
    return res.json({
      items,
      total,
      page,
      limit,
      totalPages: total ? Math.ceil(total / limit) : 1,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Failed to load return and exchange queue" });
  }
}

export async function getOrdersDashboard(req, res) {
  try {
    const orders = await CustomerOrder.find({})
      .sort({ placedAt: -1, createdAt: -1 })
      .lean();
    const enrichedOrders = await enrichOrders(orders);
    return res.json({
      dashboard: buildOrdersDashboardPayload(enrichedOrders, {
        query: req.query || {},
      }),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load orders dashboard" });
  }
}

export async function getOrdersMetrics(req, res) {
  try {
    const orders = await CustomerOrder.find({})
      .select("placedAt paymentStatus grandTotal total items")
      .lean();
    const maps = await buildAnalyticsLookupMaps(orders);

    const soldByDay = new Map();
    const soldByMonth = new Map();
    const soldByQuarter = new Map();
    const cancelledByDay = new Map();
    const cancelledByMonth = new Map();
    const cancelledByQuarter = new Map();
    const topSellingProducts = new Map();
    const topSellingCategories = new Map();
    const topCancelledProducts = new Map();
    const topCancelledCategories = new Map();

    const totals = {
      paidOrders: 0,
      failedPaymentOrders: 0,
      grossRevenue: 0,
      refundTotal: 0,
      soldItems: 0,
      cancelledItems: 0,
    };

    for (const order of orders) {
      const paymentStatus = normalizePaymentStatus(order?.paymentStatus, "pending");
      if (paymentStatus === "payment_failed") {
        totals.failedPaymentOrders += 1;
        continue;
      }

      if (REVENUE_PAYMENT_STATUSES.has(paymentStatus)) {
        totals.paidOrders += 1;
        totals.grossRevenue += asNumber(order?.grandTotal, asNumber(order?.total, 0));
      }

      const placedAt = asDate(order?.placedAt);

      for (const item of order.items || []) {
        const quantity = Math.max(0, Math.floor(asNumber(item?.quantity, 0)));
        const revenue = getItemRevenue(item);
        const itemStatus = normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED");
        const product = getProductSnapshot(item);
        const category = getCategorySnapshot(item, maps);

        if (!CANCELLED_ITEM_STATUSES.has(itemStatus)) {
          totals.soldItems += quantity;
          addTopMetric(topSellingProducts, product.id, product.label, quantity, revenue);
          addTopMetric(topSellingCategories, category.id, category.label, quantity, revenue);

          if (placedAt) {
            addTimeBucket(soldByDay, bucketDay(placedAt), quantity, revenue);
            addTimeBucket(soldByMonth, bucketMonth(placedAt), quantity, revenue);
            addTimeBucket(soldByQuarter, bucketQuarter(placedAt), quantity, revenue);
          }
        } else {
          totals.cancelledItems += quantity;
          totals.refundTotal += revenue;
          addTopMetric(topCancelledProducts, product.id, product.label, quantity, revenue);
          addTopMetric(topCancelledCategories, category.id, category.label, quantity, revenue);

          const cancelledAt = asDate(item?.cancelledAt || item?.adminCancelledAt || order?.placedAt);
          if (cancelledAt) {
            addTimeBucket(cancelledByDay, bucketDay(cancelledAt), quantity);
            addTimeBucket(cancelledByMonth, bucketMonth(cancelledAt), quantity);
            addTimeBucket(cancelledByQuarter, bucketQuarter(cancelledAt), quantity);
          }
        }
      }
    }

    return res.json({
      metrics: {
        totals,
        sold: {
          byDay: mapTimeBuckets(soldByDay, { includeRevenue: true }),
          byMonth: mapTimeBuckets(soldByMonth, { includeRevenue: true }),
          byQuarter: mapTimeBuckets(soldByQuarter, { includeRevenue: true }),
        },
        cancellations: {
          byDay: mapTimeBuckets(cancelledByDay),
          byMonth: mapTimeBuckets(cancelledByMonth),
          byQuarter: mapTimeBuckets(cancelledByQuarter),
        },
        topSellingProducts: topMetrics(topSellingProducts),
        topSellingCategories: topMetrics(topSellingCategories),
        topCancelledProducts: topMetrics(topCancelledProducts),
        topCancelledCategories: topMetrics(topCancelledCategories),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load order metrics" });
  }
}

export async function getOrder(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Order id must be a valid ObjectId" });
    }
    return res.json({ order: await fetchAndMapOrder(req.params.id) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Failed to load order" });
  }
}

function respondWithMappedOrder(res, orderDoc) {
  return res.json({ order: mapOrder(orderDoc) });
}

async function withMappedOrder(res, orderPromise, fallbackMessage) {
  try {
    const order = await orderPromise;
    return respondWithMappedOrder(res, order);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || fallbackMessage });
  }
}

async function withReturnExchangeCase(res, casePromise, fallbackMessage) {
  try {
    const caseDoc = await casePromise;
    const [shaped] = await listReturnExchangeCases({ search: String(caseDoc?._id || "") });
    return res.json({ case: shaped || null });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || fallbackMessage });
  }
}

export async function processingPickOrderItem(req, res) {
  return withMappedOrder(
    res,
    pickProcessingOrderItem({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to pick order item"
  );
}

export async function processingHandoverToPackagingOrderItem(req, res) {
  return withMappedOrder(
    res,
    handoverOrderItemToPackaging({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to hand over order item to packaging"
  );
}

export async function packagingConfirmReceiptOrderItem(req, res) {
  return withMappedOrder(
    res,
    packagingConfirmReceipt({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to confirm packaging receipt"
  );
}

export async function packagingRejectReceiptOrderItem(req, res) {
  return withMappedOrder(
    res,
    packagingRejectReceipt({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
      reason: req.body?.reason,
    }),
    "Failed to reject packaging receipt"
  );
}

export async function packagingStartOrderItem(req, res) {
  return withMappedOrder(
    res,
    startPackagingOrderItem({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to start packaging"
  );
}

export async function packagingVerifyOrderItem(req, res) {
  return withMappedOrder(
    res,
    verifyPackageOrderItem({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to verify package"
  );
}

export async function packagingPrintLabelOrderItem(req, res) {
  return withMappedOrder(
    res,
    printShippingLabel({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to print shipping label"
  );
}

export async function packagingReprintLabelOrderItem(req, res) {
  return withMappedOrder(
    res,
    reprintShippingLabel({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
      reason: req.body?.reason,
    }),
    "Failed to reprint shipping label"
  );
}

export async function packagingMarkPackedOrderItem(req, res) {
  return withMappedOrder(
    res,
    markOrderItemPacked({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to mark item packed"
  );
}

export async function packagingHandoverToShippingOrderItem(req, res) {
  return withMappedOrder(
    res,
    handoverOrderItemToShipping({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to hand over item to shipping"
  );
}

export async function shippingConfirmReceiptOrderItem(req, res) {
  return withMappedOrder(
    res,
    shippingConfirmReceipt({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to confirm shipping receipt"
  );
}

export async function shippingRejectReceiptOrderItem(req, res) {
  return withMappedOrder(
    res,
    shippingRejectReceipt({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
      reason: req.body?.reason,
    }),
    "Failed to reject shipping receipt"
  );
}

export async function shippingStartOrderItem(req, res) {
  return withMappedOrder(
    res,
    startShippingOrderItem({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to start shipping"
  );
}

export async function shippingAssignCourierOrderItem(req, res) {
  return withMappedOrder(
    res,
    assignShipmentCourier({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
      courierName: req.body?.courierName,
    }),
    "Failed to assign courier"
  );
}

export async function shippingTrackingOrderItem(req, res) {
  return withMappedOrder(
    res,
    assignShipmentTrackingNumber({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
      trackingNumber: req.body?.trackingNumber,
    }),
    "Failed to save tracking number"
  );
}

export async function shippingMarkShippedOrderItem(req, res) {
  return withMappedOrder(
    res,
    markOrderItemShipped({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to mark item shipped"
  );
}

export async function adminMarkDeliveredOrderItem(req, res) {
  return withMappedOrder(
    res,
    markOrderItemDelivered({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
      actorRole: "SHIPPING_OPERATOR",
    }),
    "Failed to mark item delivered"
  );
}

export async function adminCancelOrderItem(req, res) {
  return withMappedOrder(
    res,
    routeAdminOrderItemCancellation({
      orderItemId: req.params.itemId,
      actorId: getActorId(req),
      reason: req.body?.reason || "ADMIN_CANCELLED",
    }),
    "Failed to cancel order item"
  );
}

export async function cancellationHandoverOrderItem(req, res) {
  return withMappedOrder(
    res,
    handoverOrderItemToCancellation({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to hand over item to cancellation manager"
  );
}

export async function cancellationConfirmReceiptOrderItem(req, res) {
  return withMappedOrder(
    res,
    confirmCancellationReceipt({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to confirm cancellation receipt"
  );
}

export async function cancellationRestockOrderItem(req, res) {
  return withMappedOrder(
    res,
    restockCancelledOrderItem({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to restock cancelled item"
  );
}

export async function cancellationMarkDamagedOrderItem(req, res) {
  return withMappedOrder(
    res,
    markCancelledOrderItemDamaged({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to mark cancelled item damaged"
  );
}

export async function cancellationMarkLostOrderItem(req, res) {
  return withMappedOrder(
    res,
    markCancelledOrderItemLost({
      orderId: req.params.id,
      itemId: req.params.itemId,
      actorId: getActorId(req),
    }),
    "Failed to mark cancelled item lost"
  );
}

export async function returnExchangeStartInvestigation(req, res) {
  return withReturnExchangeCase(
    res,
    startReturnExchangeInvestigation({
      caseId: req.params.caseId,
      actorId: getActorId(req),
    }),
    "Failed to start return or exchange investigation"
  );
}

export async function returnExchangeAccept(req, res) {
  return withReturnExchangeCase(
    res,
    acceptReturnExchangeCase({
      caseId: req.params.caseId,
      actorId: getActorId(req),
      decisionNote: req.body?.decisionNote,
    }),
    "Failed to accept return or exchange case"
  );
}

export async function returnExchangeReject(req, res) {
  return withReturnExchangeCase(
    res,
    rejectReturnExchangeCase({
      caseId: req.params.caseId,
      actorId: getActorId(req),
      decisionNote: req.body?.decisionNote,
    }),
    "Failed to reject return or exchange case"
  );
}

export async function returnExchangeUpdateTracking(req, res) {
  return withReturnExchangeCase(
    res,
    updateReturnExchangeTracking({
      caseId: req.params.caseId,
      actorId: getActorId(req),
      courierName: req.body?.courierName,
      returnTrackingNumber: req.body?.returnTrackingNumber,
    }),
    "Failed to update return or exchange tracking"
  );
}

export async function returnExchangeReceive(req, res) {
  return withReturnExchangeCase(
    res,
    receiveReturnExchangeCase({
      caseId: req.params.caseId,
      actorId: getActorId(req),
    }),
    "Failed to receive return or exchange item"
  );
}

export async function returnExchangeCreatePlaceholder(req, res) {
  return withReturnExchangeCase(
    res,
    createReturnExchangePlaceholder({
      caseId: req.params.caseId,
      actorId: getActorId(req),
    }),
    "Failed to create return or exchange placeholder"
  );
}

export async function returnExchangeGenerateCoupon(req, res) {
  return withReturnExchangeCase(
    res,
    generateExchangeCoupon({
      caseId: req.params.caseId,
      actorId: getActorId(req),
    }),
    "Failed to generate exchange coupon"
  );
}
