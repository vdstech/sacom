import mongoose from "mongoose";
import CustomerAddress from "../models/customerAddressModel.js";
import CustomerOrder from "../models/customerOrderModel.js";
import StorefrontCartRead from "../models/storefrontCartReadModel.js";
import StorefrontCategoryRead from "../models/storefrontCategoryReadModel.js";
import StorefrontProductRead from "../models/storefrontProductReadModel.js";
import StorefrontVariantRead from "../models/storefrontVariantReadModel.js";
import { evaluateReturnEligibility } from "../orderEligibility.js";
import {
  buildOrderItemId,
  isCustomerCancellableItem,
  isCustomerPackedCancellationRequestable,
  isCustomerReturnableItem,
  isPackedItemAdminCancelable,
  normalizePaymentStatus,
  resolveOrderFulfillmentStatus,
  resolveOrderPaymentStatus,
} from "../orderShared.js";
import {
  buildStockOperationFromOrderItem,
  decrementStockEntry,
  incrementStockEntry,
  isValidStockOperation,
} from "../orderStock.js";

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function createHttpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function calculateDiscountedPrice(price, discount) {
  const base = Math.max(0, asNumber(price, 0));
  const type = normalizeString(discount?.type || "none").toLowerCase();
  const value = Math.max(0, asNumber(discount?.value, 0));

  if (type === "percent") return Math.max(0, Math.round(base - (base * Math.min(100, value)) / 100));
  if (type === "flat") return Math.max(0, Math.round(base - value));
  return base;
}

function normalizeCartToken(value) {
  return normalizeString(value).replace(/[^a-zA-Z0-9_-]+/g, "");
}

function buildOrderItemSnapshot(line, product, variant, stockRow, categorySnapshot = null) {
  const quantity = Math.max(1, Math.floor(asNumber(line?.quantity, 1)));
  const listUnitPrice = Math.max(0, asNumber(variant?.price, 0));
  const finalUnitPrice = calculateDiscountedPrice(listUnitPrice, variant?.discount);
  const catalogDiscountAmount = Math.max(0, listUnitPrice - finalUnitPrice);
  const lineSubtotal = listUnitPrice * quantity;
  const lineDiscountTotal = catalogDiscountAmount * quantity;
  const lineGrandTotal = finalUnitPrice * quantity;
  const imageUrl = normalizeString(variant?.images?.[0]?.url || product?.images?.[0]?.url);

  return {
    lineId: new mongoose.Types.ObjectId().toString(),
    productId: product?._id || null,
    variantId: variant?._id || null,
    categoryId: product?.categoryId || null,
    categoryLabel: normalizeString(categorySnapshot?.slug),
    stockKey: normalizeString(stockRow?.stockKey).toUpperCase(),
    slug: normalizeString(product?.slug),
    title: normalizeString(product?.title || line?.productTitle || "Product"),
    imageUrl,
    quantity,
    fulfillmentStatus: "processing",
    outboundTrackingNumber: "",
    collectionTrackingNumber: "",
    cancelRequestedAt: null,
    unpackedAt: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    adminCancelledAt: null,
    returnRequestedAt: null,
    collectionScheduledAt: null,
    returnReceivedAt: null,
    refundCompletedAt: null,
    currency: "INR",
    listUnitPrice,
    catalogDiscountType: normalizeString(variant?.discount?.type || "none"),
    catalogDiscountValue: Math.max(0, asNumber(variant?.discount?.value, 0)),
    catalogDiscountLabel: normalizeString(variant?.discount?.label),
    catalogDiscountAmount,
    promoDiscountType: "none",
    promoDiscountValue: 0,
    promoDiscountLabel: "",
    promoDiscountAmount: 0,
    finalUnitPrice,
    lineSubtotal,
    lineTaxTotal: 0,
    lineShippingTotal: 0,
    lineDiscountTotal,
    lineGrandTotal,
    unitPrice: finalUnitPrice,
    lineTotal: lineGrandTotal,
  };
}

function buildAddressSnapshot(address) {
  return {
    fullName: normalizeString(address?.fullName),
    phone: normalizeString(address?.phone),
    line1: normalizeString(address?.line1),
    line2: normalizeString(address?.line2),
    city: normalizeString(address?.city),
    state: normalizeString(address?.state),
    postalCode: normalizeString(address?.postalCode),
    country: normalizeString(address?.country),
  };
}

async function loadCustomerAddress(customerId, addressId) {
  if (!mongoose.isValidObjectId(addressId)) {
    throw createHttpError("addressId must be a valid ObjectId", 400);
  }

  const address = await CustomerAddress.findOne({
    _id: addressId,
    customer: customerId,
  }).lean();

  if (!address) throw createHttpError("Address not found", 404);
  return address;
}

async function loadCart(cartToken) {
  const normalizedToken = normalizeCartToken(cartToken);
  if (!normalizedToken) throw createHttpError("cartToken is required", 400);

  const cart = await StorefrontCartRead.findOne({ cartToken: normalizedToken });
  if (!cart) throw createHttpError("Cart not found", 404);
  if (cart.expiresAt && new Date(cart.expiresAt).getTime() <= Date.now()) {
    throw createHttpError("Cart has expired", 409);
  }
  if (!Array.isArray(cart.items) || !cart.items.length) {
    throw createHttpError("Cart is empty", 409);
  }
  return cart;
}

async function buildPreparedOrder(cart) {
  const preparedItems = [];
  const stockOperations = [];
  const categorySnapshots = new Map();

  for (const line of cart.items || []) {
    const productId = String(line?.productId || "").trim();
    const variantId = String(line?.variantId || "").trim();
    const stockKey = normalizeString(line?.stockKey).toUpperCase();
    const quantity = Math.max(1, Math.floor(asNumber(line?.quantity, 1)));

    if (!mongoose.isValidObjectId(productId) || !mongoose.isValidObjectId(variantId) || !stockKey) {
      throw createHttpError("Cart contains invalid items", 409);
    }

    const [product, variant] = await Promise.all([
      StorefrontProductRead.findOne({ _id: productId, isActive: true })
        .select("_id title slug images isActive categoryId")
        .lean(),
      StorefrontVariantRead.findOne({ _id: variantId, productId, isActive: true })
        .select("_id productId price discount images stock isActive")
        .lean(),
    ]);

    if (!product) throw createHttpError("A cart item is no longer available", 409);
    if (!variant) throw createHttpError("A selected variant is no longer available", 409);

    const categoryId = String(product?.categoryId || "").trim();
    let categorySnapshot = null;
    if (categoryId && mongoose.isValidObjectId(categoryId)) {
      if (!categorySnapshots.has(categoryId)) {
        const category = await StorefrontCategoryRead.findById(categoryId).select("_id slug").lean();
        categorySnapshots.set(categoryId, category || null);
      }
      categorySnapshot = categorySnapshots.get(categoryId) || null;
    }

    const stockRow = (Array.isArray(variant.stock) ? variant.stock : []).find(
      (entry) => normalizeString(entry?.stockKey).toUpperCase() === stockKey
    );

    if (!stockRow) throw createHttpError("A selected size is no longer available", 409);
    if (Math.max(0, asNumber(stockRow.quantity, 0)) < quantity) {
      throw createHttpError("Cart quantity exceeds current stock", 409);
    }

    preparedItems.push(buildOrderItemSnapshot(line, product, variant, stockRow, categorySnapshot));
    stockOperations.push({
      productId,
      variantId,
      stockKey,
      quantity,
    });
  }

  const subtotal = preparedItems.reduce((sum, item) => sum + Math.max(0, asNumber(item.lineSubtotal, 0)), 0);
  const discountTotal = preparedItems.reduce((sum, item) => sum + Math.max(0, asNumber(item.lineDiscountTotal, 0)), 0);
  const grandTotal = preparedItems.reduce((sum, item) => sum + Math.max(0, asNumber(item.lineGrandTotal, 0)), 0);
  const itemCount = preparedItems.reduce((sum, item) => sum + Math.max(0, asNumber(item.quantity, 0)), 0);

  return {
    items: preparedItems,
    stockOperations,
    subtotal,
    discountTotal,
    shippingTotal: 0,
    taxTotal: 0,
    grandTotal,
    itemCount,
  };
}

async function rollbackRestock(appliedOperations) {
  for (const operation of [...appliedOperations].reverse()) {
    try {
      await decrementStockEntry(operation);
    } catch {}
  }
}

async function rollbackCheckout(appliedOperations, orderId = "") {
  if (orderId && mongoose.isValidObjectId(orderId)) {
    try {
      await CustomerOrder.deleteOne({ _id: orderId });
    } catch {}
  }

  for (const operation of [...appliedOperations].reverse()) {
    try {
      await incrementStockEntry(operation);
    } catch {}
  }
}

function applyDerivedOrderState(order) {
  order.fulfillmentStatus = resolveOrderFulfillmentStatus(order);
  order.paymentStatus = resolveOrderPaymentStatus(order);
  order.status = ["cancelled", "cancelled_by_admin"].includes(order.fulfillmentStatus)
    ? order.fulfillmentStatus
    : "placed";
}

function getOrderItemOrThrow(order, itemId) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const item = items.find((entry, index) => buildOrderItemId(entry, index) === itemId);
  if (!item) throw createHttpError("Order item not found", 404);
  return item;
}

function getValidatedStockOperation(item, failureMessage) {
  const operation = buildStockOperationFromOrderItem(item);
  if (!isValidStockOperation(operation)) {
    throw createHttpError(failureMessage, 409);
  }
  return operation;
}

function markItemCancelled(item, now, { markUnpacked = false, cancelledStatus = "cancelled" } = {}) {
  if (markUnpacked) item.unpackedAt = now;
  item.cancelledAt = now;
  if (cancelledStatus === "cancelled_by_admin") item.adminCancelledAt = now;
  item.fulfillmentStatus = cancelledStatus;
}

function isWholeOrderCustomerCancellable(order) {
  if (!order || ["cancelled", "cancelled_by_admin"].includes(normalizeString(order.status).toLowerCase())) return false;
  if (normalizePaymentStatus(order?.paymentStatus, "paid") === "payment_failed") return false;
  const items = Array.isArray(order.items) ? order.items : [];
  const activeItems = items.filter(
    (item) => !["cancelled", "cancelled_by_admin"].includes(normalizeString(item?.fulfillmentStatus).toLowerCase())
  );
  if (!activeItems.length) return false;
  return activeItems.every((item) => isCustomerCancellableItem(item));
}

export async function createCustomerOrderFromCart({ customerId, cartToken, addressId, paymentStatus: requestedPaymentStatus = "paid" }) {
  const address = await loadCustomerAddress(customerId, addressId);
  const cart = await loadCart(cartToken);
  const prepared = await buildPreparedOrder(cart);
  const addressSnapshot = buildAddressSnapshot(address);
  const appliedOperations = [];
  let order = null;

  const paymentStatus = normalizeString(requestedPaymentStatus, "paid").toLowerCase() === "payment_failed"
    ? "payment_failed"
    : "paid";

  try {
    if (paymentStatus !== "payment_failed") {
      for (const operation of prepared.stockOperations) {
        await decrementStockEntry(operation);
        appliedOperations.push(operation);
      }
    }

    order = await CustomerOrder.create({
      customer: customerId,
      status: "placed",
      paymentStatus,
      fulfillmentStatus: "processing",
      currency: "INR",
      pricingVersion: 1,
      couponCode: "",
      subtotal: prepared.subtotal,
      discountTotal: prepared.discountTotal,
      shippingTotal: prepared.shippingTotal,
      taxTotal: prepared.taxTotal,
      grandTotal: prepared.grandTotal,
      total: prepared.grandTotal,
      itemCount: prepared.itemCount,
      paymentReference: "",
      addressSnapshot,
      items: prepared.items,
      placedAt: new Date(),
    });

    if (paymentStatus !== "payment_failed") {
      cart.items = [];
      cart.lastSeenAt = new Date();
      await cart.save();
    }

    return order.toObject();
  } catch (error) {
    await rollbackCheckout(appliedOperations, order?._id ? String(order._id) : "");
    throw error;
  }
}

export async function cancelCustomerOrderAndRestock({ customerId, orderId }) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw createHttpError("Order not found", 404);
  }

  const order = await CustomerOrder.findOne({
    _id: orderId,
    customer: customerId,
  });

  if (!order) throw createHttpError("Order not found", 404);
  if (!isWholeOrderCustomerCancellable(order)) {
    throw createHttpError("This order can no longer be cancelled", 409);
  }

  const activeItems = (Array.isArray(order.items) ? order.items : []).filter(
    (item) => !["cancelled", "cancelled_by_admin"].includes(normalizeString(item?.fulfillmentStatus).toLowerCase())
  );
  const stockOperations = activeItems.map((item) => getValidatedStockOperation(item, "This order cannot be cancelled because stock data is incomplete"));
  const appliedOperations = [];
  const now = new Date();

  try {
    for (let index = 0; index < stockOperations.length; index += 1) {
      const operation = stockOperations[index];
      await incrementStockEntry(operation);
      appliedOperations.push(operation);
      markItemCancelled(activeItems[index], now);
    }

    applyDerivedOrderState(order);
    await order.save();

    return order.toObject();
  } catch (error) {
    await rollbackRestock(appliedOperations);
    throw error;
  }
}

export async function cancelCustomerOrderItemAndRestock({ customerId, orderId, itemId }) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw createHttpError("Order not found", 404);
  }

  const order = await CustomerOrder.findOne({ _id: orderId, customer: customerId });
  if (!order) throw createHttpError("Order not found", 404);
  if (normalizePaymentStatus(order.paymentStatus, "paid") === "payment_failed") {
    throw createHttpError("This order failed payment and cannot be cancelled", 409);
  }

  const item = getOrderItemOrThrow(order, itemId);
  if (isCustomerCancellableItem(item)) {
    const operation = getValidatedStockOperation(item, "This order item cannot be cancelled because stock data is incomplete");
    const now = new Date();

    try {
      await incrementStockEntry(operation);
      markItemCancelled(item, now);
      applyDerivedOrderState(order);
      await order.save();
      return order.toObject();
    } catch (error) {
      try {
        await decrementStockEntry(operation);
      } catch {}
      throw error;
    }
  }

  if (isCustomerPackedCancellationRequestable(item)) {
    if (item.cancelRequestedAt) {
      throw createHttpError("Cancellation has already been requested for this packed item", 409);
    }

    item.cancelRequestedAt = new Date();
    applyDerivedOrderState(order);
    await order.save();
    return order.toObject();
  }

  throw createHttpError("This item can no longer be cancelled", 409);
}

export async function requestCustomerOrderItemReturn({ customerId, orderId, itemId }) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw createHttpError("Order not found", 404);
  }

  const order = await CustomerOrder.findOne({ _id: orderId, customer: customerId });
  if (!order) throw createHttpError("Order not found", 404);
  if (normalizePaymentStatus(order.paymentStatus, "paid") === "payment_failed") {
    throw createHttpError("This order failed payment and cannot enter return flow", 409);
  }

  const item = getOrderItemOrThrow(order, itemId);
  if (!isCustomerReturnableItem(item)) {
    throw createHttpError("This item is not eligible for return", 409);
  }
  const product = item.productId ? await StorefrontProductRead.findById(item.productId).select("returnPolicy").lean() : null;
  const eligibility = evaluateReturnEligibility({
    item,
    returnPolicy: product?.returnPolicy || null,
  });
  if (!eligibility.returnEligible) {
    if (eligibility.reason === "non_returnable") {
      throw createHttpError("This item is not returnable", 409);
    }
    if (eligibility.reason === "expired") {
      throw createHttpError("The return window has expired for this item", 409);
    }
    throw createHttpError("This item is not eligible for return yet", 409);
  }

  item.returnRequestedAt = new Date();
  item.fulfillmentStatus = "return_requested";
  applyDerivedOrderState(order);
  await order.save();

  return order.toObject();
}

export async function cancelAdminProcessingOrderItemAndRestock({ orderId, itemId }) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw createHttpError("Order not found", 404);
  }

  const order = await CustomerOrder.findById(orderId);
  if (!order) throw createHttpError("Order not found", 404);
  if (normalizePaymentStatus(order.paymentStatus, "paid") === "payment_failed") {
    throw createHttpError("Failed-payment orders cannot enter fulfillment actions", 409);
  }

  const item = getOrderItemOrThrow(order, itemId);
  if (!isCustomerCancellableItem(item)) {
    throw createHttpError("Only processing items can be cancelled immediately", 409);
  }

  const operation = getValidatedStockOperation(item, "This order item cannot be cancelled because stock data is incomplete");
  const now = new Date();

  try {
    await incrementStockEntry(operation);
    markItemCancelled(item, now, { cancelledStatus: "cancelled_by_admin" });
    applyDerivedOrderState(order);
    await order.save();
    return order.toObject();
  } catch (error) {
    try {
      await decrementStockEntry(operation);
    } catch {}
    throw error;
  }
}

export async function unpackCancelAdminOrderItemAndRestock({ orderId, itemId }) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw createHttpError("Order not found", 404);
  }

  const order = await CustomerOrder.findById(orderId);
  if (!order) throw createHttpError("Order not found", 404);
  if (normalizePaymentStatus(order.paymentStatus, "paid") === "payment_failed") {
    throw createHttpError("Failed-payment orders cannot enter fulfillment actions", 409);
  }

  const item = getOrderItemOrThrow(order, itemId);
  if (!isPackedItemAdminCancelable(item)) {
    throw createHttpError("Only packed items can be unpacked and cancelled", 409);
  }
  if (!item.cancelRequestedAt) {
    throw createHttpError("Only packed items with a cancellation request can be unpacked and cancelled", 409);
  }

  const operation = getValidatedStockOperation(item, "This packed item cannot be restocked because stock data is incomplete");
  const now = new Date();

  try {
    item.fulfillmentStatus = "unpacked";
    item.unpackedAt = now;
    await incrementStockEntry(operation);
    markItemCancelled(item, now, { markUnpacked: true, cancelledStatus: "cancelled_by_admin" });
    applyDerivedOrderState(order);
    await order.save();
    return order.toObject();
  } catch (error) {
    try {
      await decrementStockEntry(operation);
    } catch {}
    throw error;
  }
}
