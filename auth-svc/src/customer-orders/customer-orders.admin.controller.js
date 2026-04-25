import mongoose from "mongoose";
import CustomerOrder from "./customer-orders.model.js";
import StorefrontCategoryRead from "./customer-orders.storefront-category.model.js";
import StorefrontProductRead from "./customer-orders.storefront-product.model.js";
import {
  buildOrderItemId,
  mapOrder,
  normalizeItemFulfillmentStatus,
  normalizePaymentStatus,
  resolveOrderFulfillmentStatus,
  resolveOrderPaymentStatus,
  validateAdminItemStatusTransition,
} from "./customer-orders.shared.js";
import {
  buildStockOperationFromOrderItem,
  decrementStockEntry,
  incrementStockEntry,
  isValidStockOperation,
} from "./customer-orders.stock.js";
import {
  cancelAdminProcessingOrderItemAndRestock,
  unpackCancelAdminOrderItemAndRestock,
} from "./customer-orders.service.js";

const CANCELLED_ITEM_STATUSES = new Set(["cancelled", "cancelled_by_admin"]);
const REVENUE_PAYMENT_STATUSES = new Set(["paid", "refund_pending", "partially_refunded", "refunded"]);

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

function applyDerivedOrderState(order) {
  order.fulfillmentStatus = resolveOrderFulfillmentStatus(order);
  order.paymentStatus = resolveOrderPaymentStatus(order);
  order.status = ["cancelled", "cancelled_by_admin"].includes(order.fulfillmentStatus)
    ? order.fulfillmentStatus
    : "placed";
}

function buildListFilter(query = {}) {
  const filter = {};
  const search = normalizeString(query.search);
  const stockKey = normalizeString(query.stockKey).toUpperCase();
  const fulfillmentStatus = normalizeItemFulfillmentStatus(query.fulfillmentStatus, "");
  const paymentStatus = normalizePaymentStatus(query.paymentStatus, "");

  if (stockKey) filter["items.stockKey"] = stockKey;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    const clauses = [
      { paymentReference: pattern },
      { "addressSnapshot.fullName": pattern },
      { "items.title": pattern },
      { "items.stockKey": pattern },
      { "items.outboundTrackingNumber": pattern },
      { "items.collectionTrackingNumber": pattern },
    ];

    if (mongoose.isValidObjectId(search)) clauses.unshift({ _id: new mongoose.Types.ObjectId(search) });
    filter.$or = clauses;
  }

  if (fulfillmentStatus) {
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { fulfillmentStatus },
          { "items.fulfillmentStatus": fulfillmentStatus },
          ...(fulfillmentStatus === "processing"
            ? [{ fulfillmentStatus: { $in: ["pending", "processing", ""] } }]
            : []),
          ...(fulfillmentStatus === "cancelled"
            ? [{ status: "cancelled" }]
            : []),
        ],
      },
    ];

    if (fulfillmentStatus !== "cancelled") {
      filter.status = { $ne: "cancelled" };
    }
  }

  return filter;
}

function getOrderItemOrError(order, itemId) {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemIndex = items.findIndex((item, index) => buildOrderItemId(item, index) === itemId);
  if (itemIndex < 0) return null;
  return items[itemIndex];
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

export async function listOrders(req, res) {
  try {
    const page = normalizePositiveInteger(req.query?.page, 1);
    const limit = normalizePositiveInteger(req.query?.limit, 25);
    const filter = buildListFilter(req.query || {});

    const total = await CustomerOrder.countDocuments(filter);
    const orders = await CustomerOrder.find(filter)
      .sort({ placedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      items: orders.map(mapOrder),
      total,
      page,
      limit,
      totalPages: total ? Math.ceil(total / limit) : 1,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list orders" });
  }
}

export async function getOrdersDashboard(req, res) {
  try {
    const orders = await CustomerOrder.find({})
      .select("status fulfillmentStatus paymentStatus items")
      .lean();

    const summary = {
      received: 0,
      packed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      cancelledByAdmin: 0,
      paymentFailed: 0,
      total: orders.length,
    };

    for (const order of orders) {
      const paymentStatus = normalizePaymentStatus(order?.paymentStatus, "paid");
      if (paymentStatus === "payment_failed") {
        summary.paymentFailed += 1;
        continue;
      }

      const status = resolveOrderFulfillmentStatus(order);
      if (status === "processing") summary.received += 1;
      else if (status === "packed") summary.packed += 1;
      else if (status === "shipped") summary.shipped += 1;
      else if (status === "delivered") summary.delivered += 1;
      else if (status === "cancelled") summary.cancelled += 1;
      else if (status === "cancelled_by_admin") summary.cancelledByAdmin += 1;
    }

    return res.json({ summary });
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
        const itemStatus = normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "processing");
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

          const cancelledAt = asDate(item?.adminCancelledAt || item?.cancelledAt || order?.placedAt);
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

    const order = await CustomerOrder.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: "Order not found" });

    return res.json({ order: mapOrder(order) });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load order" });
  }
}

export async function cancelOrderItem(req, res) {
  try {
    const order = await cancelAdminProcessingOrderItemAndRestock({
      orderId: req.params.id,
      itemId: req.params.itemId,
    });
    return res.json({ order: mapOrder(order) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Failed to cancel order item" });
  }
}

export async function unpackCancelOrderItem(req, res) {
  try {
    const order = await unpackCancelAdminOrderItemAndRestock({
      orderId: req.params.id,
      itemId: req.params.itemId,
    });
    return res.json({ order: mapOrder(order) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Failed to unpack and cancel order item" });
  }
}

export async function updateOrderItemStatus(req, res) {
  try {
    const { id, itemId } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Order id must be a valid ObjectId" });
    }

    const requestedStatus = normalizeItemFulfillmentStatus(req.body?.fulfillmentStatus, "");
    const outboundTrackingNumber = normalizeString(req.body?.outboundTrackingNumber);
    const collectionTrackingNumber = normalizeString(req.body?.collectionTrackingNumber);
    const order = await CustomerOrder.findById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (normalizePaymentStatus(order.paymentStatus, "paid") === "payment_failed") {
      return res.status(409).json({ error: "Failed-payment orders cannot enter fulfillment actions" });
    }

    const item = getOrderItemOrError(order, itemId);
    if (!item) return res.status(404).json({ error: "Order item not found" });

    const validation = validateAdminItemStatusTransition({
      currentStatus: item.fulfillmentStatus,
      nextStatus: requestedStatus,
      outboundTrackingNumber: outboundTrackingNumber || item.outboundTrackingNumber,
      collectionTrackingNumber: collectionTrackingNumber || item.collectionTrackingNumber,
      cancelRequestedAt: item.cancelRequestedAt,
    });

    if (!validation.ok) {
      return res.status(400).json({ error: validation.error || "Invalid fulfillment transition" });
    }

    const nextStatus = normalizeItemFulfillmentStatus(requestedStatus, "");
    const now = new Date();
    let restockOperation = null;

    if (nextStatus === "return_received") {
      restockOperation = buildStockOperationFromOrderItem(item);
      if (!isValidStockOperation(restockOperation)) {
        return res.status(409).json({ error: "This returned item cannot be restocked because stock data is incomplete" });
      }
      await incrementStockEntry(restockOperation);
    }

    try {
      if (outboundTrackingNumber) item.outboundTrackingNumber = outboundTrackingNumber;
      if (collectionTrackingNumber) item.collectionTrackingNumber = collectionTrackingNumber;

      item.fulfillmentStatus = nextStatus;
      if (nextStatus === "shipped") item.shippedAt = now;
      if (nextStatus === "delivered") item.deliveredAt = now;
      if (nextStatus === "collection_scheduled") item.collectionScheduledAt = now;
      if (nextStatus === "return_received") item.returnReceivedAt = now;
      if (nextStatus === "refund_completed") item.refundCompletedAt = now;

      applyDerivedOrderState(order);
      await order.save();

      return res.json({ order: mapOrder(order.toObject()) });
    } catch (err) {
      if (restockOperation) {
        try {
          await decrementStockEntry(restockOperation);
        } catch {}
      }
      return res.status(500).json({ error: err.message || "Failed to update order item" });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update order item" });
  }
}
