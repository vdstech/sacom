import crypto from "node:crypto";
import mongoose from "mongoose";
import CustomerAddress from "../customer-addresses/customer-addresses.model.js";
import CustomerOrder from "./customer-orders.model.js";
import StorefrontCartRead from "./customer-orders.storefront-cart.model.js";
import StorefrontCategoryRead from "./customer-orders.storefront-category.model.js";
import StorefrontInventoryRead from "./customer-orders.storefront-inventory.model.js";
import StorefrontProductRead from "./customer-orders.storefront-product.model.js";
import StorefrontVariantRead from "./customer-orders.storefront-variant.model.js";
import PhysicalHandover from "./customer-orders.handover.model.js";
import CancellationCase from "./customer-orders.cancellation-case.model.js";
import ReturnExchangeCase from "./customer-orders.return-exchange-case.model.js";
import InventoryLedger from "./customer-orders.inventory-ledger.model.js";
import OrderShipment from "./customer-orders.shipment.model.js";
import ShippingLabel from "./customer-orders.shipping-label.model.js";
import StorefrontCustomer from "../customer-auth/customer-auth.model.js";
import ExchangeCoupon from "./customer-orders.exchange-coupon.model.js";
import NotificationPlaceholder from "./customer-orders.notification-placeholder.model.js";
import {
  applyPricingRules,
  calculateDiscountedPrice,
  resolveVariantTaxRate,
} from "./customer-orders.pricing.js";
import {
  buildOrderItemId,
  CANCELLATION_QUEUE_STATUSES,
  DEFAULT_TARGET_COMPLETION_HOURS,
  deriveLaneAssignedAt,
  deriveLastActionedAt,
  deriveTargetCompletionDate,
  FINAL_CANCELLATION_STATUSES,
  FULFILLMENT_DELAY_HOURS,
  FULFILLMENT_VIOLATION_HOURS,
  isCustomerCancellableItem,
  isCustomerPackedCancellationRequestable,
  isCustomerReturnableItem,
  isCustomerShippingCancellationRequestable,
  isTrackedFulfillmentLane,
  isPreShipmentStatus,
  normalizeItemFulfillmentStatus,
  normalizePaymentStatus,
  normalizeSlaStatus,
  resolveFulfillmentStage,
  resolveItemSlaStatus,
  resolveOrderFulfillmentStatus,
  resolveOrderPaymentStatus,
} from "./customer-orders.shared.js";
import { evaluateReturnEligibility } from "./customer-orders.eligibility.js";
import {
  filterReturnExchangeCasesForQueue,
  getAcceptedStatusForKind,
  getInTransitStatusForKind,
  getInvestigationStatusForKind,
  getPlaceholderPendingStatusForKind,
  getReceivedStatusForKind,
  getRejectedStatusForKind,
  getRequestedStatusForKind,
  normalizeReturnExchangeKind,
  normalizeReturnExchangeStatus,
  shapeReturnExchangeCaseForAdmin,
  validateReturnExchangePlaceholder,
  validateReturnExchangeReceipt,
  validateReturnExchangeRequest,
  validateReturnExchangeTrackingUpdate,
  validateReturnExchangeTransition,
} from "./customer-orders.return-exchange.shared.js";
import {
  buildStockOperationFromOrderItem,
  isValidStockOperation,
  markCancelledStockDamaged,
  markCancelledStockLost,
  releaseReservedStockEntry,
  reserveStockEntry,
  resolveAvailableStockQuantity,
  restockCancelledStockEntry,
  shipReservedStockEntry,
} from "./customer-orders.stock.js";
import { recordAuditEvent } from "../audit/audit.service.js";

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundMoney(value) {
  return Math.round((asNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function createHttpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeCartToken(value) {
  return normalizeString(value).replace(/[^a-zA-Z0-9_-]+/g, "");
}

function getActorId(actorId) {
  return mongoose.isValidObjectId(actorId) ? actorId : null;
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function addHours(date, hours) {
  const base = asDate(date);
  if (!base) return null;
  return new Date(base.getTime() + (hours * 60 * 60 * 1000));
}

function getHoursSince(value, now = new Date()) {
  const date = asDate(value);
  if (!date) return 0;
  return Math.max(0, (now.getTime() - date.getTime()) / (60 * 60 * 1000));
}

function initializeFulfillmentSlaFields(item, order, now = new Date()) {
  const placedAt = asDate(order?.placedAt) || now;
  if (!item.targetCompletionDate) {
    item.targetCompletionDate = addHours(placedAt, DEFAULT_TARGET_COMPLETION_HOURS);
  }
  if (!item.laneAssignedAt) {
    item.laneAssignedAt = deriveLaneAssignedAt(item, placedAt) || placedAt;
  }
  if (!item.lastActionedAt) {
    item.lastActionedAt = deriveLastActionedAt(item, placedAt) || placedAt;
  }
  if (!normalizeString(item.slaStatus)) {
    item.slaStatus = "ON_TRACK";
  }
}

function refreshFulfillmentSlaFields(item, order, {
  now = new Date(),
  resetLaneAssignedAt = false,
} = {}) {
  initializeFulfillmentSlaFields(item, order, now);
  item.lastActionedAt = now;
  if (resetLaneAssignedAt) {
    item.laneAssignedAt = now;
  }

  const stage = resolveFulfillmentStage(item);
  if (isTrackedFulfillmentLane(stage)) {
    const laneHours = item.laneAssignedAt ? getHoursSince(item.laneAssignedAt, now) : 0;
    if (laneHours >= FULFILLMENT_VIOLATION_HOURS) {
      item.slaStatus = "VIOLATED";
      return;
    }
    item.slaStatus = getHoursSince(item.lastActionedAt, now) >= FULFILLMENT_DELAY_HOURS ? "DELAYED" : "ON_TRACK";
    return;
  }

  item.slaStatus = "ON_TRACK";
}

function syncDerivedFulfillmentTrackingFields(item, order, now = new Date()) {
  const placedAt = asDate(order?.placedAt) || now;
  const targetCompletionDate = deriveTargetCompletionDate(item, placedAt);
  const laneAssignedAt = deriveLaneAssignedAt(item, placedAt);
  const lastActionedAt = deriveLastActionedAt(item, placedAt);
  const slaStatus = resolveItemSlaStatus(item, { orderPlacedAt: placedAt, now });

  item.targetCompletionDate = targetCompletionDate || null;
  item.laneAssignedAt = laneAssignedAt || null;
  item.lastActionedAt = lastActionedAt || null;
  item.slaStatus = normalizeSlaStatus(slaStatus, "ON_TRACK");
}

function assertExpectedStatus(item, expectedStatus) {
  const expected = normalizeItemFulfillmentStatus(expectedStatus, "");
  if (!expected) return;
  const current = normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED");
  if (current !== expected) {
    throw createHttpError("This task changed after you loaded it. Refresh and try again.", 409);
  }
}

function applyDerivedOrderState(order) {
  const parentStatus = resolveOrderFulfillmentStatus(order);
  order.fulfillmentStatus = parentStatus;
  order.paymentStatus = resolveOrderPaymentStatus(order);
  order.status = parentStatus;
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

function buildExchangeCouponCode() {
  return `EXC-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

function buildOrderDisplayId() {
  return `ORD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
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

function buildOrderItemSnapshot(line, product, variant, stockRow, categorySnapshot = null) {
  const quantity = Math.max(1, Math.floor(asNumber(line?.quantity, 1)));
  const listUnitPrice = Math.max(0, asNumber(variant?.price, 0));
  const finalUnitPrice = calculateDiscountedPrice(listUnitPrice, variant?.discount);
  const taxRate = resolveVariantTaxRate(variant?.taxRate);
  const catalogDiscountAmount = roundMoney(Math.max(0, listUnitPrice - finalUnitPrice));
  const lineSubtotal = roundMoney(listUnitPrice * quantity);
  const lineDiscountTotal = roundMoney(catalogDiscountAmount * quantity);
  const lineGrandTotal = roundMoney(finalUnitPrice * quantity);
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
    fulfillmentStatus: "RESERVED",
    physicalOwner: "WAREHOUSE",
    cancellationSource: "",
    cancellationReason: "",
    packageVerificationStatus: "PENDING",
    labelStatus: "NOT_PRINTED",
    labelReprintCount: 0,
    labelReprintReason: "",
    courierName: "",
    outboundTrackingNumber: "",
    collectionTrackingNumber: "",
    targetCompletionDate: null,
    laneAssignedAt: null,
    lastActionedAt: null,
    slaStatus: "ON_TRACK",
    cancelRequestedAt: null,
    pickedAt: null,
    pickedBy: null,
    handedToPackagingAt: null,
    packagingReceivedAt: null,
    packagingReceivedBy: null,
    packagingStartedAt: null,
    packagingStartedBy: null,
    packageVerifiedAt: null,
    packageVerifiedBy: null,
    labelPrintedAt: null,
    labelPrintedBy: null,
    packedAt: null,
    packedBy: null,
    handedToShippingAt: null,
    shippingReceivedAt: null,
    shippingReceivedBy: null,
    shippingStartedAt: null,
    shippingStartedBy: null,
    courierAssignedAt: null,
    courierAssignedBy: null,
    trackingNumberEnteredAt: null,
    trackingNumberEnteredBy: null,
    shippedAt: null,
    shippedBy: null,
    deliveredAt: null,
    deliveredBy: null,
    cancelledAt: null,
    adminCancelledAt: null,
    handedToCancellationAt: null,
    cancellationReceivedAt: null,
    cancellationReceivedBy: null,
    cancellationClosedAt: null,
    cancellationClosedBy: null,
    returnRequestedAt: null,
    collectionScheduledAt: null,
    returnReceivedAt: null,
    returnReceivedBy: null,
    inventoryAcceptedAt: null,
    inventoryAcceptedBy: null,
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
    taxRate,
    priceIncludesTax: true,
    finalUnitPrice,
    lineSubtotal,
    lineTaxableBaseTotal: 0,
    lineTaxTotal: 0,
    lineShippingTotal: 0,
    lineDiscountTotal,
    lineGrandTotal,
    unitPrice: finalUnitPrice,
    lineTotal: lineGrandTotal,
  };
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

    const [product, variant, inventoryRow] = await Promise.all([
      StorefrontProductRead.findOne({ _id: productId, isActive: true })
        .select("_id title slug images isActive categoryId")
        .lean(),
      StorefrontVariantRead.findOne({ _id: variantId, productId, isActive: true })
        .select("_id productId price discount taxRate images stock isActive")
        .lean(),
      StorefrontInventoryRead.findOne({
        productId,
        variantId,
        stockKey,
      })
        .select("stockKey sizeLabel quantity availableQty reservedQty damagedQty lostQty reorderLevel")
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

    const projectedStockRow = (Array.isArray(variant.stock) ? variant.stock : []).find(
      (entry) => normalizeString(entry?.stockKey).toUpperCase() === stockKey
    );
    const stockRow = inventoryRow || projectedStockRow;

    if (!stockRow) throw createHttpError("A selected size is no longer available", 409);
    const availableQty = resolveAvailableStockQuantity(stockRow);
    if (availableQty < quantity) {
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

  const itemCount = preparedItems.reduce((sum, item) => sum + Math.max(0, asNumber(item.quantity, 0)), 0);
  const pricing = applyPricingRules({ items: preparedItems, couponAppliedAmount: 0, currency: "INR" });

  return {
    items: pricing.items,
    stockOperations,
    subtotal: pricing.subtotal,
    discountTotal: pricing.discountTotal,
    taxableBaseTotal: pricing.taxableBaseTotal,
    shippingTotal: pricing.shippingTotal,
    taxTotal: pricing.taxTotal,
    grandTotal: pricing.grandTotal,
    discountedMerchandiseTotal: pricing.discountedMerchandiseTotal,
    discountedMerchandiseTotalBeforeCoupon: pricing.discountedMerchandiseTotalBeforeCoupon,
    couponAppliedAmount: pricing.couponAppliedAmount,
    pricingVersion: pricing.pricingVersion,
    pricingSnapshot: pricing.snapshot,
    itemCount,
  };
}

export async function prepareCustomerOrderFromCart({ cartToken }) {
  const cart = await loadCart(cartToken);
  const prepared = await buildPreparedOrder(cart);
  return { cart, prepared };
}

function getOrderItemOrThrow(order, itemId) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const item = items.find((entry, index) => buildOrderItemId(entry, index) === itemId);
  if (!item) throw createHttpError("Order item not found", 404);
  return item;
}

async function loadOrderByItemId(itemId) {
  const order = await CustomerOrder.findOne({ "items.lineId": itemId });
  if (!order) throw createHttpError("Order item not found", 404);
  return order;
}

function getValidatedStockOperation(item, failureMessage) {
  const operation = buildStockOperationFromOrderItem(item);
  if (!isValidStockOperation(operation)) {
    throw createHttpError(failureMessage, 409);
  }
  return operation;
}

async function createInventoryLedgerEntry({
  item,
  orderId,
  movementType,
  quantity,
  availableChange = 0,
  reservedChange = 0,
  damagedChange = 0,
  lostChange = 0,
  userId = null,
  referenceType = "",
  referenceId = "",
  remarks = "",
}) {
  await InventoryLedger.create({
    stockKey: normalizeString(item?.stockKey).toUpperCase(),
    productId: item?.productId || null,
    variantId: item?.variantId || null,
    orderId: mongoose.isValidObjectId(orderId) ? orderId : null,
    orderItemId: buildOrderItemId(item),
    movementType,
    quantity,
    availableChange,
    reservedChange,
    damagedChange,
    lostChange,
    userId: getActorId(userId),
    referenceType,
    referenceId,
    remarks,
  });
}

async function createAuditLog({
  orderId,
  itemId,
  userId = null,
  role = "",
  action,
  oldStatus = "",
  newStatus = "",
  remarks = "",
  metadata = {},
}) {
  const entityType = itemId ? "ORDER_ITEM" : "ORDER";
  const entityId = itemId || String(orderId || "");
  await recordAuditEvent({
    action,
    entityType,
    entityId,
    entityDisplayId: String(orderId || entityId),
    actor: {
      actorType: role === "CUSTOMER" ? "CUSTOMER" : "USER",
      userId: getActorId(userId),
      role,
      roleNames: role ? [role] : [],
    },
    before: oldStatus ? { status: oldStatus } : undefined,
    after: newStatus ? { status: newStatus } : undefined,
    metadata: {
      orderId: mongoose.isValidObjectId(orderId) ? String(orderId) : "",
      orderItemId: itemId || "",
      remarks,
      ...(metadata || {}),
    },
  });
}

async function createInventoryMovementAuditLog({
  item,
  orderId,
  actorId = null,
  actorRole = "",
  action,
  quantity = 0,
  availableChange = 0,
  reservedChange = 0,
  damagedChange = 0,
  lostChange = 0,
  referenceType = "",
  referenceId = "",
  metadata = {},
}) {
  await recordAuditEvent({
    action,
    entityType: "INVENTORY",
    entityId: normalizeString(item?.stockKey).toUpperCase(),
    entityDisplayId: normalizeString(item?.stockKey).toUpperCase(),
    actor: {
      actorType: actorRole === "CUSTOMER" ? "CUSTOMER" : "USER",
      userId: getActorId(actorId),
      role: actorRole,
      roleNames: actorRole ? [actorRole] : [],
    },
    metadata: {
      stockKey: normalizeString(item?.stockKey).toUpperCase(),
      productId: mongoose.isValidObjectId(item?.productId) ? String(item.productId) : "",
      variantId: mongoose.isValidObjectId(item?.variantId) ? String(item.variantId) : "",
      orderId: mongoose.isValidObjectId(orderId) ? String(orderId) : "",
      orderItemId: buildOrderItemId(item),
      quantity: asNumber(quantity, 0),
      deltas: {
        available: asNumber(availableChange, 0),
        reserved: asNumber(reservedChange, 0),
        damaged: asNumber(damagedChange, 0),
        lost: asNumber(lostChange, 0),
      },
      referenceType: normalizeString(referenceType),
      referenceId: normalizeString(referenceId),
      ...(metadata || {}),
    },
  });
}

export async function finalizePreparedCustomerOrder({
  customerId,
  cart,
  prepared,
  addressId,
  paymentStatus: requestedPaymentStatus = "paid",
  couponSnapshot = null,
  actorId = null,
  actorRole = "CUSTOMER",
  clearCartOnSuccess = true,
}) {
  const address = await loadCustomerAddress(customerId, addressId);
  const addressSnapshot = buildAddressSnapshot(address);
  const appliedOperations = [];
  let order = null;

  const paymentStatus = "paid";
  const couponCode = normalizeString(couponSnapshot?.couponCode);
  const couponAppliedAmount = Math.max(0, asNumber(couponSnapshot?.appliedAmount, 0));
  const couponForfeitedAmount = Math.max(0, asNumber(couponSnapshot?.forfeitedAmount, 0));
  const couponDiscountTotal = couponCode ? couponAppliedAmount : 0;
  const pricing = applyPricingRules({
    items: prepared?.items || [],
    couponAppliedAmount,
    currency: "INR",
    couponCode,
  });
  const subtotal = Math.max(0, asNumber(pricing.subtotal, 0));
  const catalogDiscountTotal = Math.max(0, asNumber(pricing.catalogDiscountTotal, 0));
  const shippingTotal = pricing.shippingTotal;
  const taxTotal = pricing.taxTotal;
  const grandTotal = pricing.grandTotal;
  const displayId = buildOrderDisplayId();

  try {
    for (const operation of prepared.stockOperations || []) {
      await reserveStockEntry(operation);
      appliedOperations.push(operation);
    }

    order = await CustomerOrder.create({
      customer: customerId,
      status: "PLACED",
      paymentStatus,
      fulfillmentStatus: "PLACED",
      currency: "INR",
      pricingVersion: pricing.pricingVersion,
      couponCode,
      couponDiscountTotal,
      couponAppliedAmount,
      couponForfeitedAmount,
      subtotal,
      discountTotal: pricing.discountTotal,
      shippingTotal,
      taxableBaseTotal: pricing.taxableBaseTotal,
      taxTotal,
      grandTotal,
      total: grandTotal,
      itemCount: Math.max(0, asNumber(prepared?.itemCount, 0)),
      displayId,
      pricingSnapshot: pricing.snapshot,
      addressSnapshot,
      items: pricing.items,
      placedAt: new Date(),
    });

    for (const item of order.items || []) {
      initializeFulfillmentSlaFields(item, order, order.placedAt || new Date());
    }
    await order.save();

    for (const item of order.items || []) {
      const operation = getValidatedStockOperation(item, "Invalid stock operation for reservation ledger");
      await createInventoryLedgerEntry({
        item,
        orderId: order._id,
        movementType: "RESERVE",
        quantity: operation.quantity,
        availableChange: -operation.quantity,
        reservedChange: operation.quantity,
        referenceType: "ORDER",
        referenceId: buildOrderItemId(item),
      });
      await createInventoryMovementAuditLog({
        item,
        orderId: order._id,
        actorId,
        actorRole,
        action: "INVENTORY_RESERVED",
        quantity: operation.quantity,
        availableChange: -operation.quantity,
        reservedChange: operation.quantity,
        referenceType: "ORDER",
        referenceId: buildOrderItemId(item),
      });
    }

    if (clearCartOnSuccess && cart) {
      cart.items = [];
      cart.lastSeenAt = new Date();
      await cart.save();
    }

    await createAuditLog({
      orderId: order._id,
      userId: actorId,
      role: actorRole,
      action: "ORDER_CREATED",
      newStatus: "PLACED",
      metadata: {
        displayId,
        couponCode,
        couponAppliedAmount,
        couponForfeitedAmount,
        paymentStatus,
        pricingRuleVersion: pricing.pricingVersion,
        taxMode: pricing.snapshot?.taxMode,
        taxRatesUsed: pricing.snapshot?.taxRatesUsed || [],
        includedTaxTotal: taxTotal,
        shippingRule: pricing.snapshot?.shippingRule || null,
        shippingCharge: shippingTotal,
        payableTotal: grandTotal,
        pricingSnapshot: pricing.snapshot,
      },
    });

    return order.toObject();
  } catch (error) {
    for (const operation of [...appliedOperations].reverse()) {
      try {
        await releaseReservedStockEntry(operation);
      } catch {}
    }
    if (order?._id && mongoose.isValidObjectId(order._id)) {
      try {
        await CustomerOrder.deleteOne({ _id: order._id });
      } catch {}
    }
    throw error;
  }
}

async function ensureNoPendingHandover(itemId) {
  const pending = await PhysicalHandover.findOne({
    orderItemId: itemId,
    status: "PENDING_RECEIPT",
  }).select("_id").lean();

  if (pending) {
    throw createHttpError("This item already has a pending handover", 409);
  }
}

async function getPendingHandover(itemId, type) {
  const handover = await PhysicalHandover.findOne({
    orderItemId: itemId,
    type,
    status: "PENDING_RECEIPT",
  }).sort({ createdAt: -1 });

  if (!handover) {
    throw createHttpError("Pending handover was not found for this item", 404);
  }
  return handover;
}

async function getLatestPendingNonCancellationHandover(itemId) {
  return PhysicalHandover.findOne({
    orderItemId: itemId,
    status: "PENDING_RECEIPT",
    type: { $ne: "CURRENT_OWNER_TO_CANCELLATION" },
  }).sort({ createdAt: -1 });
}

async function resolveNonCancellationPendingHandovers(itemId, actorId, reason = "CANCELLED_FOR_CANCELLATION_REQUEST") {
  const pendingHandovers = await PhysicalHandover.find({
    orderItemId: itemId,
    status: "PENDING_RECEIPT",
  }).sort({ createdAt: -1 });
  let fromOwner = "";

  for (const handover of pendingHandovers) {
    if (handover.type === "CURRENT_OWNER_TO_CANCELLATION") {
      throw createHttpError("A cancellation handover is already pending for this item", 409);
    }

    if (!fromOwner) {
      fromOwner = normalizeString(handover.fromOwner).toUpperCase();
    }

    handover.status = "REJECTED";
    handover.receivedByUserId = getActorId(actorId);
    handover.receivedAt = new Date();
    handover.rejectionReason = normalizeString(reason, "CANCELLED_FOR_CANCELLATION_REQUEST");
    await handover.save();
  }

  return fromOwner;
}

async function ensureNoOpenCancellationCase(itemId) {
  const existing = await CancellationCase.findOne({
    orderItemId: itemId,
    status: "OPEN",
  }).select("_id").lean();

  if (existing) {
    throw createHttpError("An active cancellation case already exists for this item", 409);
  }
}

async function getOpenCancellationCase(itemId) {
  const caseDoc = await CancellationCase.findOne({
    orderItemId: itemId,
    status: "OPEN",
  }).sort({ createdAt: -1 });

  if (!caseDoc) {
    throw createHttpError("Active cancellation case not found for this item", 404);
  }
  return caseDoc;
}

async function findReturnExchangeCaseByItemId(itemId) {
  return ReturnExchangeCase.findOne({ orderItemId: itemId }).sort({ createdAt: -1 });
}

async function ensureNoReturnExchangeCase(itemId) {
  const existing = await findReturnExchangeCaseByItemId(itemId);
  if (existing) {
    throw createHttpError("A return or exchange case already exists for this item", 409);
  }
}

async function getReturnExchangeCaseById(caseId) {
  if (!mongoose.isValidObjectId(caseId)) throw createHttpError("Return or exchange case not found", 404);
  const caseDoc = await ReturnExchangeCase.findById(caseId);
  if (!caseDoc) throw createHttpError("Return or exchange case not found", 404);
  return caseDoc;
}

async function getReturnExchangeCaseWithOrder(caseId) {
  const caseDoc = await getReturnExchangeCaseById(caseId);
  const order = await CustomerOrder.findById(caseDoc.orderId);
  if (!order) throw createHttpError("Order not found", 404);
  const item = getOrderItemOrThrow(order, caseDoc.orderItemId);
  return { caseDoc, order, item };
}

function assertReturnExchangeTransition(currentStatus, nextStatus, message) {
  const validation = validateReturnExchangeTransition(currentStatus, nextStatus);
  if (!validation.ok) {
    throw createHttpError(message || validation.error, 409);
  }
}

function sanitizeCustomerContact(customer) {
  return {
    id: String(customer?._id || ""),
    name: normalizeString(customer?.name),
    email: normalizeString(customer?.email),
    phone: normalizeString(customer?.phone),
  };
}

async function loadCustomerOrderItemForReturnExchange({ customerId, orderId, itemId }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findOne({ _id: orderId, customer: customerId });
  if (!order) throw createHttpError("Order not found", 404);
  const item = getOrderItemOrThrow(order, itemId);
  const caseDoc = await findReturnExchangeCaseByItemId(buildOrderItemId(item));
  const productId = String(item?.productId || "").trim();
  const product = productId && mongoose.isValidObjectId(productId)
    ? await StorefrontProductRead.findById(productId).select("_id returnPolicy").lean()
    : null;
  const eligibility = evaluateReturnEligibility({
    item,
    returnPolicy: product?.returnPolicy || null,
  });
  return { order, item, caseDoc, product, eligibility };
}

export async function listReturnExchangeCases({ kind = "", status = "", search = "" } = {}) {
  const normalizedKind = normalizeReturnExchangeKind(kind, "");
  const normalizedStatus = normalizeReturnExchangeStatus(status, "");
  const query = {};

  if (normalizedKind) query.kind = normalizedKind;
  if (normalizedStatus) query.status = normalizedStatus;

  const caseDocs = await ReturnExchangeCase.find(query).sort({ createdAt: -1 }).lean();
  if (!caseDocs.length) return [];

  const orderIds = Array.from(new Set(caseDocs.map((caseDoc) => String(caseDoc.orderId || "")).filter(Boolean)));
  const customerIds = Array.from(new Set(caseDocs.map((caseDoc) => String(caseDoc.customerId || "")).filter(Boolean)));

  const [orders, customers] = await Promise.all([
    CustomerOrder.find({ _id: { $in: orderIds } }).lean(),
    StorefrontCustomer.find({ _id: { $in: customerIds } }).select("_id name email phone").lean(),
  ]);

  const ordersById = new Map(orders.map((order) => [String(order._id), order]));
  const customersById = new Map(customers.map((customer) => [String(customer._id), customer]));
  return filterReturnExchangeCasesForQueue(
    caseDocs
    .map((caseDoc) => {
      const order = ordersById.get(String(caseDoc.orderId || "")) || null;
      const customer = customersById.get(String(caseDoc.customerId || "")) || null;
      const item = order ? getOrderItemOrThrow(order, caseDoc.orderItemId) : null;
      const mappedOrder = order ? order.toObject?.() || order : null;
      return shapeReturnExchangeCaseForAdmin({
        ...caseDoc,
        productName: normalizeString(item?.title),
        coupon: caseDoc?.couponId ? {
          id: String(caseDoc.couponId),
          generatedAt: caseDoc.couponGeneratedAt || null,
        } : null,
        customer: customer ? sanitizeCustomerContact(customer) : null,
        order: mappedOrder ? {
          id: String(mappedOrder._id || ""),
          placedAt: mappedOrder.placedAt || null,
          paymentStatus: normalizeString(mappedOrder.paymentStatus),
          fulfillmentStatus: normalizeString(mappedOrder.fulfillmentStatus),
          addressSnapshot: mappedOrder.addressSnapshot || null,
        } : null,
        orderItem: item ? {
          id: buildOrderItemId(item),
          title: normalizeString(item.title),
          quantity: asNumber(item.quantity, 1),
          fulfillmentStatus: normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED"),
          deliveredAt: item.deliveredAt || null,
          imageUrl: normalizeString(item.imageUrl),
          stockKey: normalizeString(item.stockKey),
        } : null,
      });
    }),
    { kind: normalizedKind, status: normalizedStatus, search }
  );
}

function assertAdminOrderActionable(order) {
  if (!order) throw createHttpError("Order not found", 404);
  if (normalizePaymentStatus(order.paymentStatus, "paid") === "payment_failed") {
    throw createHttpError("Failed-payment orders cannot enter fulfillment actions", 409);
  }
}

function getItemOwner(item) {
  return normalizeString(item?.physicalOwner).toUpperCase();
}

function isCancelledPendingShippingReceipt(item, handover) {
  return normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "RESERVED") === "CANCEL_REQUESTED" &&
    normalizeString(handover?.type).toUpperCase() === "PACKAGING_TO_SHIPPING" &&
    normalizeString(handover?.status).toUpperCase() === "PENDING_RECEIPT";
}

async function finalizeBeforePickingCancellation({ order, item, actorId, actorRole = "", source = "CUSTOMER", reason = "" }) {
  const operation = getValidatedStockOperation(item, "This item cannot release reservation because stock data is incomplete");
  await releaseReservedStockEntry(operation);
  await createInventoryLedgerEntry({
    item,
    orderId: order._id,
    movementType: "RELEASE_RESERVATION",
    quantity: operation.quantity,
    availableChange: operation.quantity,
    reservedChange: -operation.quantity,
    userId: actorId,
    referenceType: source,
    referenceId: buildOrderItemId(item),
    remarks: reason,
  });
  await createInventoryMovementAuditLog({
    item,
    orderId: order._id,
    actorId,
    actorRole,
    action: "INVENTORY_RELEASED",
    quantity: operation.quantity,
    availableChange: operation.quantity,
    reservedChange: -operation.quantity,
    referenceType: source,
    referenceId: buildOrderItemId(item),
    metadata: { reason: normalizeString(reason), source: normalizeString(source) },
  });

  const previousStatus = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  item.fulfillmentStatus = "CANCELLED_BEFORE_PICKING";
  item.physicalOwner = "NONE";
  item.cancelRequestedAt = new Date();
  item.cancellationSource = source;
  item.cancellationReason = reason;
  item.cancelledAt = new Date();
  syncDerivedFulfillmentTrackingFields(item, order, item.cancelledAt);
  applyDerivedOrderState(order);
  await order.save();

  await createAuditLog({
    orderId: order._id,
    itemId: buildOrderItemId(item),
    userId: actorId,
    role: actorRole,
    action: "CANCEL_BEFORE_PICKING",
    oldStatus: previousStatus,
    newStatus: "CANCELLED_BEFORE_PICKING",
    remarks: reason,
  });
}

async function openCancellationCase({ order, item, actorId, actorRole = "", source = "CUSTOMER", reason = "" }) {
  await ensureNoOpenCancellationCase(buildOrderItemId(item));
  const previousStatus = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  const pendingHandover = await getLatestPendingNonCancellationHandover(buildOrderItemId(item));
  if (pendingHandover?.fromOwner) {
    item.physicalOwner = normalizeString(pendingHandover.fromOwner).toUpperCase();
  }
  item.fulfillmentStatus = "CANCEL_REQUESTED";
  item.cancelRequestedAt = new Date();
  item.cancellationSource = source;
  item.cancellationReason = reason;
  if (source === "ADMIN") item.adminCancelledAt = new Date();
  refreshFulfillmentSlaFields(item, order, { now: item.cancelRequestedAt, resetLaneAssignedAt: false });

  await CancellationCase.create({
    orderId: order._id,
    orderItemId: buildOrderItemId(item),
    source,
    reason,
    requestedByUserId: getActorId(actorId),
  });

  applyDerivedOrderState(order);
  await order.save();

  await createAuditLog({
    orderId: order._id,
    itemId: buildOrderItemId(item),
    userId: actorId,
    role: actorRole,
    action: source === "ADMIN" ? "ADMIN_CANCEL_REQUESTED" : "CUSTOMER_CANCEL_REQUESTED",
    oldStatus: previousStatus,
    newStatus: "CANCEL_REQUESTED",
    remarks: reason,
  });
}

async function updateShippingLabel(item, orderId, userId, action, reason = "") {
  const label = await ShippingLabel.findOneAndUpdate(
    { orderId, orderItemId: buildOrderItemId(item) },
    {
      $setOnInsert: { orderId, orderItemId: buildOrderItemId(item) },
      $set: {
        status: "PRINTED",
        printedAt: item.labelPrintedAt,
        printedByUserId: getActorId(userId),
        reprintReason: reason || item.labelReprintReason || "",
      },
      ...(action === "reprint"
        ? { $inc: { reprintCount: 1 } }
        : {}),
    },
    { upsert: true, new: true }
  );

  if (action === "reprint") {
    item.labelReprintCount = Math.max(0, asNumber(label?.reprintCount, item.labelReprintCount || 0));
  }
}

async function updateShipmentRecord(item, orderId, userId) {
  await OrderShipment.findOneAndUpdate(
    { orderId, orderItemId: buildOrderItemId(item) },
    {
      $setOnInsert: { orderId, orderItemId: buildOrderItemId(item) },
      $set: {
        courierName: normalizeString(item.courierName),
        trackingNumber: normalizeString(item.outboundTrackingNumber),
        shippedAt: item.shippedAt || null,
        shippedByUserId: getActorId(userId),
        status: item.shippedAt ? "SHIPPED" : "PENDING",
      },
    },
    { upsert: true, new: true }
  );
}

export async function createCustomerOrderFromCart({ customerId, cartToken, addressId, paymentStatus: requestedPaymentStatus = "paid" }) {
  const { cart, prepared } = await prepareCustomerOrderFromCart({ cartToken });
  return finalizePreparedCustomerOrder({
    customerId,
    cart,
    prepared,
    addressId,
    paymentStatus: requestedPaymentStatus,
  });
}

export async function cancelCustomerOrderAndRestock({ customerId, orderId }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findOne({ _id: orderId, customer: customerId });
  if (!order) throw createHttpError("Order not found", 404);
  if (normalizePaymentStatus(order.paymentStatus, "paid") === "payment_failed") {
    throw createHttpError("This order failed payment and cannot be cancelled", 409);
  }

  for (const item of order.items || []) {
    const status = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
    if (FINAL_CANCELLATION_STATUSES.includes(status)) continue;
    if (status === "SHIPPED") {
      throw createHttpError("Cancellation is not allowed after shipment", 409);
    }
    if (status === "RESERVED") {
      await finalizeBeforePickingCancellation({ order, item, source: "CUSTOMER" });
    } else if (isPreShipmentStatus(status)) {
      await openCancellationCase({ order, item, source: "CUSTOMER" });
    } else {
      throw createHttpError("This order can no longer be cancelled", 409);
    }
  }

  await order.save();
  return order.toObject();
}

export async function cancelCustomerOrderItemAndRestock({ customerId, orderId, itemId }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findOne({ _id: orderId, customer: customerId });
  if (!order) throw createHttpError("Order not found", 404);
  const item = getOrderItemOrThrow(order, itemId);
  const status = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");

  if (status === "SHIPPED") {
    throw createHttpError("Cancellation is not allowed after shipment", 409);
  }
  if (status === "RESERVED") {
    await finalizeBeforePickingCancellation({ order, item, source: "CUSTOMER" });
    return order.toObject();
  }
  if (isPreShipmentStatus(status)) {
    await openCancellationCase({ order, item, source: "CUSTOMER" });
    return order.toObject();
  }

  throw createHttpError("This item can no longer be cancelled", 409);
}

async function createReturnExchangeCase({
  customerId,
  orderId,
  itemId,
  kind = "RETURN",
  reason,
  phoneNumber,
  whatsappNumber,
}) {
  const normalizedKind = normalizeReturnExchangeKind(kind);
  const { order, item, caseDoc, eligibility } = await loadCustomerOrderItemForReturnExchange({
    customerId,
    orderId,
    itemId,
  });

  await ensureNoReturnExchangeCase(buildOrderItemId(item));
  const validation = validateReturnExchangeRequest({
    kind: normalizedKind,
    eligibility,
    reason,
    phoneNumber,
    whatsappNumber,
    existingCase: caseDoc,
  });
  if (!validation.ok) {
    throw createHttpError(validation.error, validation.statusCode || 400);
  }

  const created = await ReturnExchangeCase.create({
    orderId: order._id,
    orderItemId: buildOrderItemId(item),
    customerId,
    kind: normalizedKind,
    status: getRequestedStatusForKind(normalizedKind),
    reason: validation.reason,
    phoneNumber: validation.phoneNumber,
    whatsappNumber: validation.whatsappNumber,
  });

  await createAuditLog({
    orderId: order._id,
    itemId: buildOrderItemId(item),
    userId: customerId,
    role: "CUSTOMER",
    action: normalizedKind === "EXCHANGE" ? "CUSTOMER_EXCHANGE_REQUESTED" : "CUSTOMER_RETURN_REQUESTED",
    newStatus: created.status,
    remarks: validation.reason,
  });

  return order.toObject();
}

export async function requestCustomerOrderItemReturn({
  customerId,
  orderId,
  itemId,
  reason,
  phoneNumber,
  whatsappNumber,
}) {
  return createReturnExchangeCase({
    customerId,
    orderId,
    itemId,
    kind: "RETURN",
    reason,
    phoneNumber,
    whatsappNumber,
  });
}

export async function requestCustomerOrderItemExchange({
  customerId,
  orderId,
  itemId,
  reason,
  phoneNumber,
  whatsappNumber,
}) {
  return createReturnExchangeCase({
    customerId,
    orderId,
    itemId,
    kind: "EXCHANGE",
    reason,
    phoneNumber,
    whatsappNumber,
  });
}

export async function startReturnExchangeInvestigation({ caseId, actorId, actorRole = "RETURN_EXCHANGE_HANDLER" }) {
  const { caseDoc } = await getReturnExchangeCaseWithOrder(caseId);
  const previousStatus = normalizeReturnExchangeStatus(caseDoc.status);
  const nextStatus = getInvestigationStatusForKind(caseDoc.kind);
  assertReturnExchangeTransition(
    previousStatus,
    nextStatus,
    caseDoc.kind === "EXCHANGE"
      ? "Exchange must be in requested status before investigation"
      : "Return must be in requested status before investigation"
  );

  caseDoc.status = nextStatus;
  caseDoc.investigationStartedAt = new Date();
  caseDoc.investigationStartedByUserId = getActorId(actorId);
  await caseDoc.save();

  await createAuditLog({
    orderId: caseDoc.orderId,
    itemId: caseDoc.orderItemId,
    userId: actorId,
    role: actorRole,
    action: "ISSUE_EXCHANGE_INVESTIGATION_STARTED",
    oldStatus: previousStatus,
    newStatus: nextStatus,
    metadata: { caseId: String(caseDoc._id), kind: caseDoc.kind },
  });

  return caseDoc.toObject();
}

export async function acceptReturnExchangeCase({ caseId, actorId, actorRole = "RETURN_EXCHANGE_HANDLER", decisionNote = "" }) {
  const { caseDoc } = await getReturnExchangeCaseWithOrder(caseId);
  const previousStatus = normalizeReturnExchangeStatus(caseDoc.status);
  const nextStatus = getAcceptedStatusForKind(caseDoc.kind);
  assertReturnExchangeTransition(
    previousStatus,
    nextStatus,
    caseDoc.kind === "EXCHANGE"
      ? "Exchange must be under investigation before acceptance"
      : "Return must be under investigation before acceptance"
  );

  caseDoc.status = nextStatus;
  caseDoc.decisionNote = normalizeString(decisionNote);
  caseDoc.acceptedAt = new Date();
  caseDoc.acceptedByUserId = getActorId(actorId);
  await caseDoc.save();

  await createAuditLog({
    orderId: caseDoc.orderId,
    itemId: caseDoc.orderItemId,
    userId: actorId,
    role: actorRole,
    action: "ISSUE_EXCHANGE_APPROVED",
    oldStatus: previousStatus,
    newStatus: nextStatus,
    remarks: caseDoc.decisionNote,
    metadata: { caseId: String(caseDoc._id), kind: caseDoc.kind },
  });

  return caseDoc.toObject();
}

export async function rejectReturnExchangeCase({ caseId, actorId, actorRole = "RETURN_EXCHANGE_HANDLER", decisionNote = "" }) {
  const { caseDoc } = await getReturnExchangeCaseWithOrder(caseId);
  const previousStatus = normalizeReturnExchangeStatus(caseDoc.status);
  const nextStatus = getRejectedStatusForKind(caseDoc.kind);
  assertReturnExchangeTransition(
    previousStatus,
    nextStatus,
    caseDoc.kind === "EXCHANGE"
      ? "Exchange must be under investigation before rejection"
      : "Return must be under investigation before rejection"
  );

  caseDoc.status = nextStatus;
  caseDoc.decisionNote = normalizeString(decisionNote);
  caseDoc.rejectedAt = new Date();
  caseDoc.rejectedByUserId = getActorId(actorId);
  await caseDoc.save();

  await createAuditLog({
    orderId: caseDoc.orderId,
    itemId: caseDoc.orderItemId,
    userId: actorId,
    role: actorRole,
    action: "ISSUE_EXCHANGE_REJECTED",
    oldStatus: previousStatus,
    newStatus: nextStatus,
    remarks: caseDoc.decisionNote,
    metadata: { caseId: String(caseDoc._id), kind: caseDoc.kind },
  });

  return caseDoc.toObject();
}

export async function updateReturnExchangeTracking({
  caseId,
  actorId,
  actorRole = "RETURN_EXCHANGE_HANDLER",
  courierName,
  returnTrackingNumber,
}) {
  const { caseDoc } = await getReturnExchangeCaseWithOrder(caseId);
  const previousStatus = normalizeReturnExchangeStatus(caseDoc.status);
  const nextStatus = getInTransitStatusForKind(caseDoc.kind);
  const validation = validateReturnExchangeTrackingUpdate({
    kind: caseDoc.kind,
    currentStatus: previousStatus,
    courierName,
    returnTrackingNumber,
  });
  if (!validation.ok) throw createHttpError(validation.error, validation.statusCode || 409);

  caseDoc.status = nextStatus;
  caseDoc.courierName = validation.courierName;
  caseDoc.returnTrackingNumber = validation.returnTrackingNumber;
  caseDoc.trackingUpdatedAt = new Date();
  caseDoc.trackingUpdatedByUserId = getActorId(actorId);
  await caseDoc.save();

  await createAuditLog({
    orderId: caseDoc.orderId,
    itemId: caseDoc.orderItemId,
    userId: actorId,
    role: actorRole,
    action: "ISSUE_EXCHANGE_TRACKING_UPDATED",
    oldStatus: previousStatus,
    newStatus: nextStatus,
    remarks: validation.returnTrackingNumber,
    metadata: { caseId: String(caseDoc._id), kind: caseDoc.kind, courierName: validation.courierName },
  });

  return caseDoc.toObject();
}

export async function receiveReturnExchangeCase({ caseId, actorId, actorRole = "RETURN_EXCHANGE_HANDLER" }) {
  const { caseDoc } = await getReturnExchangeCaseWithOrder(caseId);
  const previousStatus = normalizeReturnExchangeStatus(caseDoc.status);
  const nextStatus = getReceivedStatusForKind(caseDoc.kind);
  const validation = validateReturnExchangeReceipt({
    kind: caseDoc.kind,
    currentStatus: previousStatus,
    returnTrackingNumber: caseDoc.returnTrackingNumber,
  });
  if (!validation.ok) throw createHttpError(validation.error, validation.statusCode || 409);

  caseDoc.status = nextStatus;
  caseDoc.receivedAt = new Date();
  caseDoc.receivedByUserId = getActorId(actorId);
  await caseDoc.save();

  await createAuditLog({
    orderId: caseDoc.orderId,
    itemId: caseDoc.orderItemId,
    userId: actorId,
    role: actorRole,
    action: "ISSUE_EXCHANGE_RECEIVED",
    oldStatus: previousStatus,
    newStatus: nextStatus,
    metadata: { caseId: String(caseDoc._id), kind: caseDoc.kind },
  });

  return caseDoc.toObject();
}

export async function createReturnExchangePlaceholder({ caseId, actorId, actorRole = "RETURN_EXCHANGE_HANDLER" }) {
  const { caseDoc } = await getReturnExchangeCaseWithOrder(caseId);
  if (normalizeReturnExchangeKind(caseDoc.kind) === "EXCHANGE") {
    throw createHttpError("Use coupon generation for exchange cases", 409);
  }
  const previousStatus = normalizeReturnExchangeStatus(caseDoc.status);
  const nextStatus = getPlaceholderPendingStatusForKind(caseDoc.kind);
  const validation = validateReturnExchangePlaceholder({
    kind: caseDoc.kind,
    currentStatus: previousStatus,
  });
  if (!validation.ok) throw createHttpError(validation.error, validation.statusCode || 409);

  caseDoc.status = nextStatus;
  caseDoc.placeholderCreatedAt = new Date();
  caseDoc.placeholderCreatedByUserId = getActorId(actorId);
  await caseDoc.save();

  await createAuditLog({
    orderId: caseDoc.orderId,
    itemId: caseDoc.orderItemId,
    userId: actorId,
    role: actorRole,
    action: "MANUAL_EXTERNAL_RESOLUTION_NOTED",
    oldStatus: previousStatus,
    newStatus: nextStatus,
    metadata: { caseId: String(caseDoc._id), kind: caseDoc.kind, resolutionMode: "MANUAL_EXTERNAL" },
  });

  return caseDoc.toObject();
}

export async function generateExchangeCoupon({ caseId, actorId, actorRole = "RETURN_EXCHANGE_HANDLER" }) {
  const { caseDoc, order, item } = await getReturnExchangeCaseWithOrder(caseId);
  const previousStatus = normalizeReturnExchangeStatus(caseDoc.status);

  if (normalizeReturnExchangeKind(caseDoc.kind) !== "EXCHANGE") {
    throw createHttpError("Coupon generation is supported only for exchange cases", 409);
  }
  if (previousStatus === "EXCHANGE_REJECTED") {
    throw createHttpError("Coupon cannot be generated for rejected exchange", 409);
  }
  if (previousStatus !== "EXCHANGE_RECEIVED") {
    throw createHttpError("Coupon can be generated only after exchange item is received", 409);
  }
  if (caseDoc.couponId) {
    throw createHttpError("Coupon has already been generated for this exchange case", 409);
  }

  const eligiblePaidAmount = asNumber(item?.lineGrandTotal, NaN);
  if (!Number.isFinite(eligiblePaidAmount)) {
    throw createHttpError("Eligible paid amount is missing", 409);
  }
  if (eligiblePaidAmount <= 0) {
    throw createHttpError("Coupon value must be greater than zero", 409);
  }

  const existingCoupon = await ExchangeCoupon.findOne({ exchangeCaseId: caseDoc._id }).select("_id").lean();
  if (existingCoupon) {
    throw createHttpError("Coupon has already been generated for this exchange case", 409);
  }

  const generatedAt = new Date();
  const validUntil = new Date(generatedAt);
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);

  let coupon = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      coupon = await ExchangeCoupon.create({
        code: buildExchangeCouponCode(),
        customerId: caseDoc.customerId,
        exchangeCaseId: caseDoc._id,
        orderId: order._id,
        orderItemId: caseDoc.orderItemId,
        valueAmount: eligiblePaidAmount,
        currency: normalizeString(order?.currency, "INR"),
        status: "ACTIVE",
        validFrom: generatedAt,
        validUntil,
      });
      break;
    } catch (error) {
      if (error?.code !== 11000 || attempt === 4) throw error;
    }
  }

  if (!coupon) {
    throw createHttpError("Unable to generate coupon", 500);
  }

  await NotificationPlaceholder.create([
    {
      customerId: caseDoc.customerId,
      couponId: coupon._id,
      channel: "EMAIL",
      status: "PENDING",
      payload: { code: coupon.code },
    },
    {
      customerId: caseDoc.customerId,
      couponId: coupon._id,
      channel: "SMS",
      status: "PENDING",
      payload: { code: coupon.code },
    },
  ]);

  caseDoc.status = "EXCHANGE_COUPON_GENERATED";
  caseDoc.couponId = coupon._id;
  caseDoc.couponGeneratedAt = generatedAt;
  caseDoc.couponGeneratedByUserId = getActorId(actorId);
  await caseDoc.save();

  await createAuditLog({
    orderId: caseDoc.orderId,
    itemId: caseDoc.orderItemId,
    userId: actorId,
    role: actorRole,
    action: "CASH_COUPON_CREATED",
    oldStatus: previousStatus,
    newStatus: "EXCHANGE_COUPON_GENERATED",
    metadata: {
      caseId: String(caseDoc._id),
      couponId: String(coupon._id),
      couponCode: coupon.code,
      couponValue: eligiblePaidAmount,
      validUntil,
    },
  });

  return caseDoc.toObject();
}

export async function pickProcessingOrderItem({ orderId, itemId, actorId, actorRole = "PROCESSING_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const previousStatus = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  if (previousStatus !== "RESERVED") {
    throw createHttpError(previousStatus === "PICKED_FROM_WAREHOUSE" ? "Item is already picked" : "Only reserved items can be picked", 409);
  }

  item.fulfillmentStatus = "PICKED_FROM_WAREHOUSE";
  item.physicalOwner = "PROCESSING_MANAGER";
  item.pickedAt = new Date();
  item.pickedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.pickedAt, resetLaneAssignedAt: false });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "PICK_FROM_WAREHOUSE",
    oldStatus: previousStatus,
    newStatus: "PICKED_FROM_WAREHOUSE",
  });
  return order.toObject();
}

export async function handoverOrderItemToPackaging({ orderId, itemId, actorId, actorRole = "PROCESSING_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const previousStatus = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  if (previousStatus !== "PICKED_FROM_WAREHOUSE" || normalizeString(item.physicalOwner).toUpperCase() !== "PROCESSING_MANAGER") {
    throw createHttpError("Only picked processing-owned items can be handed to packaging", 409);
  }
  await ensureNoPendingHandover(itemId);

  await PhysicalHandover.create({
    orderId: order._id,
    orderItemId: itemId,
    type: "PROCESSING_TO_PACKAGING",
    fromOwner: "PROCESSING_MANAGER",
    toOwner: "PACKAGING_MANAGER",
    handedOverByUserId: getActorId(actorId),
  });

  item.fulfillmentStatus = "HANDED_TO_PACKAGING";
  item.handedToPackagingAt = new Date();
  refreshFulfillmentSlaFields(item, order, { now: item.handedToPackagingAt, resetLaneAssignedAt: true });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "HANDOVER_TO_PACKAGING",
    oldStatus: previousStatus,
    newStatus: "HANDED_TO_PACKAGING",
  });
  return order.toObject();
}

export async function packagingConfirmReceipt({ orderId, itemId, actorId, actorRole = "PACKAGING_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const handover = await getPendingHandover(itemId, "PROCESSING_TO_PACKAGING");
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "HANDED_TO_PACKAGING") {
    throw createHttpError("Packaging receipt confirmation is required for handed-over items only", 409);
  }

  handover.status = "RECEIVED";
  handover.receivedByUserId = getActorId(actorId);
  handover.receivedAt = new Date();
  await handover.save();

  item.fulfillmentStatus = "PACKAGING_RECEIVED";
  item.physicalOwner = "PACKAGING_MANAGER";
  item.packagingReceivedAt = new Date();
  item.packagingReceivedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.packagingReceivedAt, resetLaneAssignedAt: false });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "PACKAGING_CONFIRM_RECEIPT",
    oldStatus: "HANDED_TO_PACKAGING",
    newStatus: "PACKAGING_RECEIVED",
  });
  return order.toObject();
}

export async function packagingRejectReceipt({ orderId, itemId, actorId, actorRole = "PACKAGING_MANAGER", reason = "ITEM_NOT_RECEIVED", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const handover = await getPendingHandover(itemId, "PROCESSING_TO_PACKAGING");
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "HANDED_TO_PACKAGING") {
    throw createHttpError("Only handed-over packaging items can be rejected", 409);
  }

  handover.status = "REJECTED";
  handover.receivedByUserId = getActorId(actorId);
  handover.receivedAt = new Date();
  handover.rejectionReason = normalizeString(reason, "ITEM_NOT_RECEIVED");
  await handover.save();

  item.fulfillmentStatus = "PICKED_FROM_WAREHOUSE";
  item.physicalOwner = "PROCESSING_MANAGER";
  refreshFulfillmentSlaFields(item, order, { now: handover.receivedAt || new Date(), resetLaneAssignedAt: true });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "PACKAGING_REJECT_RECEIPT",
    oldStatus: "HANDED_TO_PACKAGING",
    newStatus: "PICKED_FROM_WAREHOUSE",
    remarks: handover.rejectionReason,
  });
  return order.toObject();
}

export async function startPackagingOrderItem({ orderId, itemId, actorId, actorRole = "PACKAGING_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const previousStatus = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  if (previousStatus !== "PACKAGING_RECEIVED") {
    throw createHttpError("Packaging receipt confirmation is required before packing", 409);
  }

  item.fulfillmentStatus = "PACKAGING_IN_PROGRESS";
  item.packagingStartedAt = new Date();
  item.packagingStartedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.packagingStartedAt, resetLaneAssignedAt: false });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "START_PACKAGING",
    oldStatus: previousStatus,
    newStatus: "PACKAGING_IN_PROGRESS",
  });
  return order.toObject();
}

export async function verifyPackageOrderItem({ orderId, itemId, actorId, actorRole = "PACKAGING_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "PACKAGING_IN_PROGRESS") {
    throw createHttpError("Only packaging-in-progress items can be verified", 409);
  }

  item.packageVerificationStatus = "VERIFIED";
  item.packageVerifiedAt = new Date();
  item.packageVerifiedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.packageVerifiedAt, resetLaneAssignedAt: false });
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "VERIFY_PACKAGE",
    oldStatus: "PACKAGING_IN_PROGRESS",
    newStatus: "PACKAGING_IN_PROGRESS",
  });
  return order.toObject();
}

export async function printShippingLabel({ orderId, itemId, actorId, actorRole = "PACKAGING_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "PACKAGING_IN_PROGRESS") {
    throw createHttpError("Only packaging-in-progress items can print labels", 409);
  }
  if (normalizeString(item.packageVerificationStatus).toUpperCase() !== "VERIFIED") {
    throw createHttpError("Package verification is required before label printing", 409);
  }

  item.labelStatus = "PRINTED";
  item.labelPrintedAt = new Date();
  item.labelPrintedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.labelPrintedAt, resetLaneAssignedAt: false });
  await updateShippingLabel(item, order._id, actorId, "print");
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "PRINT_LABEL",
    oldStatus: "PACKAGING_IN_PROGRESS",
    newStatus: "PACKAGING_IN_PROGRESS",
  });
  return order.toObject();
}

export async function reprintShippingLabel({ orderId, itemId, actorId, actorRole = "PACKAGING_MANAGER", reason = "LABEL_DAMAGED", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "PACKAGING_IN_PROGRESS") {
    throw createHttpError("Only packaging-in-progress items can reprint labels", 409);
  }
  if (normalizeString(item.labelStatus).toUpperCase() !== "PRINTED") {
    throw createHttpError("Label must be printed before it can be reprinted", 409);
  }

  item.labelReprintReason = normalizeString(reason, "LABEL_DAMAGED");
  item.labelPrintedAt = new Date();
  item.labelPrintedBy = getActorId(actorId);
  item.labelReprintCount = Math.max(0, asNumber(item.labelReprintCount, 0)) + 1;
  refreshFulfillmentSlaFields(item, order, { now: item.labelPrintedAt, resetLaneAssignedAt: false });
  await updateShippingLabel(item, order._id, actorId, "reprint", item.labelReprintReason);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "REPRINT_LABEL",
    oldStatus: "PACKAGING_IN_PROGRESS",
    newStatus: "PACKAGING_IN_PROGRESS",
    remarks: item.labelReprintReason,
  });
  return order.toObject();
}

export async function markOrderItemPacked({ orderId, itemId, actorId, actorRole = "PACKAGING_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const validation = {
    packageVerificationStatus: item.packageVerificationStatus,
    labelStatus: item.labelStatus,
  };
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "PACKAGING_IN_PROGRESS") {
    throw createHttpError("Only packaging-in-progress items can be marked packed", 409);
  }
  if (normalizeString(validation.packageVerificationStatus).toUpperCase() !== "VERIFIED") {
    throw createHttpError("Package verification is required before packing is completed", 409);
  }
  if (normalizeString(validation.labelStatus).toUpperCase() !== "PRINTED") {
    throw createHttpError("Shipping label must be printed before packing is completed", 409);
  }

  item.fulfillmentStatus = "PACKED";
  item.physicalOwner = "PACKAGING_MANAGER";
  item.packedAt = new Date();
  item.packedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.packedAt, resetLaneAssignedAt: false });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "MARK_PACKED",
    oldStatus: "PACKAGING_IN_PROGRESS",
    newStatus: "PACKED",
  });
  return order.toObject();
}

export async function handoverOrderItemToShipping({ orderId, itemId, actorId, actorRole = "PACKAGING_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "PACKED" || normalizeString(item.physicalOwner).toUpperCase() !== "PACKAGING_MANAGER") {
    throw createHttpError("Only packed packaging-owned items can be handed to shipping", 409);
  }
  await ensureNoPendingHandover(itemId);

  await PhysicalHandover.create({
    orderId: order._id,
    orderItemId: itemId,
    type: "PACKAGING_TO_SHIPPING",
    fromOwner: "PACKAGING_MANAGER",
    toOwner: "SHIPPING_OPERATOR",
    handedOverByUserId: getActorId(actorId),
  });

  item.fulfillmentStatus = "HANDED_TO_SHIPPING";
  item.handedToShippingAt = new Date();
  refreshFulfillmentSlaFields(item, order, { now: item.handedToShippingAt, resetLaneAssignedAt: true });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "HANDOVER_TO_SHIPPING",
    oldStatus: "PACKED",
    newStatus: "HANDED_TO_SHIPPING",
  });
  return order.toObject();
}

export async function shippingConfirmReceipt({ orderId, itemId, actorId, actorRole = "SHIPPING_OPERATOR", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const handover = await getPendingHandover(itemId, "PACKAGING_TO_SHIPPING");
  const previousStatus = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  const cancelledPendingReceipt = isCancelledPendingShippingReceipt(item, handover);
  if (previousStatus !== "HANDED_TO_SHIPPING" && !cancelledPendingReceipt) {
    throw createHttpError("Shipping receipt confirmation is required for handed-over items only", 409);
  }

  handover.status = "RECEIVED";
  handover.receivedByUserId = getActorId(actorId);
  handover.receivedAt = new Date();
  await handover.save();

  item.fulfillmentStatus = cancelledPendingReceipt ? "CANCEL_REQUESTED" : "SHIPPING_RECEIVED";
  item.physicalOwner = "SHIPPING_OPERATOR";
  item.shippingReceivedAt = new Date();
  item.shippingReceivedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.shippingReceivedAt, resetLaneAssignedAt: false });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "SHIPPING_CONFIRM_RECEIPT",
    oldStatus: previousStatus,
    newStatus: item.fulfillmentStatus,
  });
  return order.toObject();
}

export async function shippingRejectReceipt({ orderId, itemId, actorId, actorRole = "SHIPPING_OPERATOR", reason = "ITEM_NOT_RECEIVED", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const handover = await getPendingHandover(itemId, "PACKAGING_TO_SHIPPING");
  const previousStatus = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  const cancelledPendingReceipt = isCancelledPendingShippingReceipt(item, handover);
  if (previousStatus !== "HANDED_TO_SHIPPING" && !cancelledPendingReceipt) {
    throw createHttpError("Only handed-over shipping items can be rejected", 409);
  }

  handover.status = "REJECTED";
  handover.receivedByUserId = getActorId(actorId);
  handover.receivedAt = new Date();
  handover.rejectionReason = normalizeString(reason, "ITEM_NOT_RECEIVED");
  await handover.save();

  item.fulfillmentStatus = cancelledPendingReceipt ? "CANCEL_REQUESTED" : "PACKED";
  item.physicalOwner = "PACKAGING_MANAGER";
  refreshFulfillmentSlaFields(item, order, { now: handover.receivedAt || new Date(), resetLaneAssignedAt: true });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "SHIPPING_REJECT_RECEIPT",
    oldStatus: previousStatus,
    newStatus: item.fulfillmentStatus,
    remarks: handover.rejectionReason,
  });
  return order.toObject();
}

export async function startShippingOrderItem({ orderId, itemId, actorId, actorRole = "SHIPPING_OPERATOR", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "SHIPPING_RECEIVED") {
    throw createHttpError("Shipping receipt confirmation is required before shipping", 409);
  }

  item.fulfillmentStatus = "SHIPPING_IN_PROGRESS";
  item.shippingStartedAt = new Date();
  item.shippingStartedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.shippingStartedAt, resetLaneAssignedAt: false });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "START_SHIPPING",
    oldStatus: "SHIPPING_RECEIVED",
    newStatus: "SHIPPING_IN_PROGRESS",
  });
  return order.toObject();
}

export async function assignShipmentCourier({ orderId, itemId, actorId, actorRole = "SHIPPING_OPERATOR", courierName, expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const courier = normalizeString(courierName);
  if (!courier) throw createHttpError("Courier is required", 400);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "SHIPPING_IN_PROGRESS") {
    throw createHttpError("Only shipping-in-progress items can assign a courier", 409);
  }

  item.courierName = courier;
  item.courierAssignedAt = new Date();
  item.courierAssignedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.courierAssignedAt, resetLaneAssignedAt: false });
  await updateShipmentRecord(item, order._id, actorId);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "ASSIGN_COURIER",
    oldStatus: "SHIPPING_IN_PROGRESS",
    newStatus: "SHIPPING_IN_PROGRESS",
    remarks: courier,
  });
  return order.toObject();
}

export async function assignShipmentTrackingNumber({ orderId, itemId, actorId, actorRole = "SHIPPING_OPERATOR", trackingNumber, expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const tracking = normalizeString(trackingNumber);
  if (!tracking) throw createHttpError("Tracking number is required", 400);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "SHIPPING_IN_PROGRESS") {
    throw createHttpError("Only shipping-in-progress items can receive a tracking number", 409);
  }
  if (!normalizeString(item.courierName)) {
    throw createHttpError("Courier must be selected before tracking number is entered", 409);
  }

  item.outboundTrackingNumber = tracking;
  item.trackingNumberEnteredAt = new Date();
  item.trackingNumberEnteredBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.trackingNumberEnteredAt, resetLaneAssignedAt: false });
  await updateShipmentRecord(item, order._id, actorId);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "ENTER_TRACKING_NUMBER",
    oldStatus: "SHIPPING_IN_PROGRESS",
    newStatus: "SHIPPING_IN_PROGRESS",
    remarks: tracking,
  });
  return order.toObject();
}

export async function markOrderItemShipped({ orderId, itemId, actorId, actorRole = "SHIPPING_OPERATOR", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "SHIPPING_IN_PROGRESS") {
    throw createHttpError("Only shipping-in-progress items can be marked shipped", 409);
  }
  if (!normalizeString(item.courierName)) {
    throw createHttpError("Courier must be selected before tracking number is entered", 409);
  }
  if (!normalizeString(item.outboundTrackingNumber)) {
    throw createHttpError("Tracking number is required before marking item as shipped", 409);
  }

  const operation = getValidatedStockOperation(item, "This shipped item cannot update inventory because stock data is incomplete");
  await shipReservedStockEntry(operation);
  await createInventoryLedgerEntry({
    item,
    orderId: order._id,
    movementType: "SHIP",
    quantity: operation.quantity,
    reservedChange: -operation.quantity,
    userId: actorId,
    referenceType: "SHIPMENT",
    referenceId: item.outboundTrackingNumber,
  });
  await createInventoryMovementAuditLog({
    item,
    orderId: order._id,
    actorId,
    actorRole,
    action: "INVENTORY_SHIPPED",
    quantity: operation.quantity,
    reservedChange: -operation.quantity,
    referenceType: "SHIPMENT",
    referenceId: item.outboundTrackingNumber,
  });

  item.fulfillmentStatus = "SHIPPED";
  item.physicalOwner = "COURIER";
  item.shippedAt = new Date();
  item.shippedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.shippedAt, resetLaneAssignedAt: false });
  await updateShipmentRecord(item, order._id, actorId);
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "MARK_SHIPPED",
    oldStatus: "SHIPPING_IN_PROGRESS",
    newStatus: "SHIPPED",
    remarks: item.outboundTrackingNumber,
  });
  return order.toObject();
}

export async function shipOrderItem({
  orderId,
  itemId,
  actorId,
  actorRole = "SHIPPING_OPERATOR",
  courierName,
  trackingNumber,
  expectedStatus = "",
}) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const courier = normalizeString(courierName);
  const tracking = normalizeString(trackingNumber);
  if (!courier) throw createHttpError("Courier is required", 400);
  if (!tracking) throw createHttpError("Tracking number is required", 400);

  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);

  const currentStatus = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  if (!["SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(currentStatus)) {
    throw createHttpError("Only shipping-received or shipping-in-progress items can be shipped", 409);
  }

  if (currentStatus === "SHIPPING_RECEIVED") {
    item.fulfillmentStatus = "SHIPPING_IN_PROGRESS";
    item.shippingStartedAt = new Date();
    item.shippingStartedBy = getActorId(actorId);
    refreshFulfillmentSlaFields(item, order, { now: item.shippingStartedAt, resetLaneAssignedAt: false });
    applyDerivedOrderState(order);
  }

  item.courierName = courier;
  item.courierAssignedAt = new Date();
  item.courierAssignedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.courierAssignedAt, resetLaneAssignedAt: false });

  item.outboundTrackingNumber = tracking;
  item.trackingNumberEnteredAt = new Date();
  item.trackingNumberEnteredBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.trackingNumberEnteredAt, resetLaneAssignedAt: false });

  const operation = getValidatedStockOperation(item, "This shipped item cannot update inventory because stock data is incomplete");
  await shipReservedStockEntry(operation);
  await createInventoryLedgerEntry({
    item,
    orderId: order._id,
    movementType: "SHIP",
    quantity: operation.quantity,
    reservedChange: -operation.quantity,
    userId: actorId,
    referenceType: "SHIPMENT",
    referenceId: item.outboundTrackingNumber,
  });
  await createInventoryMovementAuditLog({
    item,
    orderId: order._id,
    actorId,
    actorRole,
    action: "INVENTORY_SHIPPED",
    quantity: operation.quantity,
    reservedChange: -operation.quantity,
    referenceType: "SHIPMENT",
    referenceId: item.outboundTrackingNumber,
  });

  item.fulfillmentStatus = "SHIPPED";
  item.physicalOwner = "COURIER";
  item.shippedAt = new Date();
  item.shippedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.shippedAt, resetLaneAssignedAt: false });
  await updateShipmentRecord(item, order._id, actorId);
  applyDerivedOrderState(order);
  await order.save();
  if (currentStatus === "SHIPPING_RECEIVED") {
    await createAuditLog({
      orderId: order._id,
      itemId,
      userId: actorId,
      role: actorRole,
      action: "START_SHIPPING",
      oldStatus: "SHIPPING_RECEIVED",
      newStatus: "SHIPPING_IN_PROGRESS",
    });
  }
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "ASSIGN_COURIER",
    oldStatus: "SHIPPING_IN_PROGRESS",
    newStatus: "SHIPPING_IN_PROGRESS",
    remarks: courier,
  });
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "ENTER_TRACKING_NUMBER",
    oldStatus: "SHIPPING_IN_PROGRESS",
    newStatus: "SHIPPING_IN_PROGRESS",
    remarks: tracking,
  });
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "MARK_SHIPPED",
    oldStatus: "SHIPPING_IN_PROGRESS",
    newStatus: "SHIPPED",
    remarks: item.outboundTrackingNumber,
  });
  return order.toObject();
}

export async function markOrderItemDelivered({ orderId, itemId, actorId, actorRole = "ORDER_ADMIN", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const status = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");

  if (status !== "SHIPPED") {
    throw createHttpError("Only shipped items can be marked as delivered", 409);
  }

  item.fulfillmentStatus = "DELIVERED";
  item.deliveredAt = new Date();
  item.deliveredBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.deliveredAt, resetLaneAssignedAt: false });
  applyDerivedOrderState(order);
  await order.save();

  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "MARK_DELIVERED",
    oldStatus: "SHIPPED",
    newStatus: "DELIVERED",
    remarks: item.outboundTrackingNumber || "",
    metadata: {
      deliveredAt: item.deliveredAt,
      courierName: normalizeString(item.courierName),
      trackingNumber: normalizeString(item.outboundTrackingNumber),
    },
  });

  return order.toObject();
}

export async function routeAdminOrderItemCancellation({ orderItemId, actorId, actorRole = "ORDER_ADMIN", reason = "ADMIN_CANCELLED", expectedStatus = "" }) {
  const order = await loadOrderByItemId(orderItemId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, orderItemId);
  assertExpectedStatus(item, expectedStatus);
  const status = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");

  if (status === "SHIPPED") {
    throw createHttpError("Shipped items cannot be cancelled", 409);
  }
  if (status === "RESERVED") {
    await finalizeBeforePickingCancellation({ order, item, actorId, actorRole, source: "ADMIN", reason });
    return order.toObject();
  }
  if (POST_PICK_PRE_SHIPMENT_STATUSES.includes(status)) {
    await openCancellationCase({ order, item, actorId, actorRole, source: "ADMIN", reason });
    return order.toObject();
  }
  if (CANCELLATION_QUEUE_STATUSES.includes(status) || FINAL_CANCELLATION_STATUSES.includes(status)) {
    throw createHttpError("An active cancellation case already exists for this item", 409);
  }
  throw createHttpError("This item cannot be cancelled from its current status", 409);
}

export async function handoverOrderItemToCancellation({ orderId, itemId, actorId, actorRole = "", remarks = "", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "CANCEL_REQUESTED") {
    throw createHttpError("Only cancellation-requested items can be handed to the cancellation manager", 409);
  }
  const pendingNonCancellationHandover = await getLatestPendingNonCancellationHandover(itemId);
  if (normalizeString(pendingNonCancellationHandover?.type).toUpperCase() === "PACKAGING_TO_SHIPPING") {
    throw createHttpError("Shipping must confirm or reject receipt before this item can move to the cancellation manager", 409);
  }
  const effectiveOwnerFromHandover = await resolveNonCancellationPendingHandovers(itemId, actorId);
  const effectiveOwner = effectiveOwnerFromHandover || normalizeString(item.physicalOwner).toUpperCase();
  if (effectiveOwner) {
    item.physicalOwner = effectiveOwner;
  }

  await PhysicalHandover.create({
    orderId: order._id,
    orderItemId: itemId,
    type: "CURRENT_OWNER_TO_CANCELLATION",
    fromOwner: effectiveOwner,
    toOwner: "CANCELLATION_MANAGER",
    handedOverByUserId: getActorId(actorId),
  });

  item.fulfillmentStatus = "HANDED_TO_CANCELLATION";
  item.handedToCancellationAt = new Date();
  refreshFulfillmentSlaFields(item, order, { now: item.handedToCancellationAt, resetLaneAssignedAt: true });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "HANDOVER_TO_CANCELLATION",
    oldStatus: "CANCEL_REQUESTED",
    newStatus: "HANDED_TO_CANCELLATION",
    remarks,
  });
  return order.toObject();
}

export async function confirmCancellationReceipt({ orderId, itemId, actorId, actorRole = "CANCELLATION_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const handover = await getPendingHandover(itemId, "CURRENT_OWNER_TO_CANCELLATION");
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "HANDED_TO_CANCELLATION") {
    throw createHttpError("Only handed-over cancellation items can confirm receipt", 409);
  }

  handover.status = "RECEIVED";
  handover.receivedByUserId = getActorId(actorId);
  handover.receivedAt = new Date();
  await handover.save();

  item.fulfillmentStatus = "CANCELLATION_RECEIVED";
  item.physicalOwner = "CANCELLATION_MANAGER";
  item.cancellationReceivedAt = new Date();
  item.cancellationReceivedBy = getActorId(actorId);
  refreshFulfillmentSlaFields(item, order, { now: item.cancellationReceivedAt, resetLaneAssignedAt: false });
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "CONFIRM_CANCELLATION_RECEIPT",
    oldStatus: "HANDED_TO_CANCELLATION",
    newStatus: "CANCELLATION_RECEIVED",
  });
  return order.toObject();
}

async function closeCancellationCase(caseDoc, actorId, resolution) {
  caseDoc.status = "CLOSED";
  caseDoc.closedByUserId = getActorId(actorId);
  caseDoc.closedAt = new Date();
  caseDoc.resolution = resolution;
  await caseDoc.save();
}

export async function restockCancelledOrderItem({ orderId, itemId, actorId, actorRole = "CANCELLATION_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "CANCELLATION_RECEIVED") {
    throw createHttpError("Only cancellation-received items can be restocked", 409);
  }

  const operation = getValidatedStockOperation(item, "This cancelled item cannot be restocked because stock data is incomplete");
  await restockCancelledStockEntry(operation);
  await createInventoryLedgerEntry({
    item,
    orderId: order._id,
    movementType: "RESTOCK_CANCELLED_ITEM",
    quantity: operation.quantity,
    availableChange: operation.quantity,
    reservedChange: -operation.quantity,
    userId: actorId,
    referenceType: "CANCELLATION",
    referenceId: itemId,
  });
  await createInventoryMovementAuditLog({
    item,
    orderId: order._id,
    actorId,
    actorRole,
    action: "INVENTORY_RESTOCKED",
    quantity: operation.quantity,
    availableChange: operation.quantity,
    reservedChange: -operation.quantity,
    referenceType: "CANCELLATION",
    referenceId: itemId,
  });

  const caseDoc = await getOpenCancellationCase(itemId);
  await closeCancellationCase(caseDoc, actorId, "RESTOCKED");

  item.fulfillmentStatus = "CANCEL_RESTOCKED";
  item.physicalOwner = "NONE";
  item.cancellationClosedAt = new Date();
  item.cancellationClosedBy = getActorId(actorId);
  item.cancelledAt = new Date();
  syncDerivedFulfillmentTrackingFields(item, order, item.cancelledAt);
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "RESTOCK_CANCELLED_ITEM",
    oldStatus: "CANCELLATION_RECEIVED",
    newStatus: "CANCEL_RESTOCKED",
  });
  return order.toObject();
}

export async function markCancelledOrderItemDamaged({ orderId, itemId, actorId, actorRole = "CANCELLATION_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  if (normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED") !== "CANCELLATION_RECEIVED") {
    throw createHttpError("Only cancellation-received items can be marked damaged", 409);
  }

  const operation = getValidatedStockOperation(item, "This cancelled item cannot be marked damaged because stock data is incomplete");
  await markCancelledStockDamaged(operation);
  await createInventoryLedgerEntry({
    item,
    orderId: order._id,
    movementType: "MARK_CANCELLED_ITEM_DAMAGED",
    quantity: operation.quantity,
    reservedChange: -operation.quantity,
    damagedChange: operation.quantity,
    userId: actorId,
    referenceType: "CANCELLATION",
    referenceId: itemId,
  });
  await createInventoryMovementAuditLog({
    item,
    orderId: order._id,
    actorId,
    actorRole,
    action: "INVENTORY_MARKED_DAMAGED",
    quantity: operation.quantity,
    reservedChange: -operation.quantity,
    damagedChange: operation.quantity,
    referenceType: "CANCELLATION",
    referenceId: itemId,
  });

  const caseDoc = await getOpenCancellationCase(itemId);
  await closeCancellationCase(caseDoc, actorId, "DAMAGED");

  item.fulfillmentStatus = "CANCEL_DAMAGED";
  item.physicalOwner = "NONE";
  item.cancellationClosedAt = new Date();
  item.cancellationClosedBy = getActorId(actorId);
  item.cancelledAt = new Date();
  syncDerivedFulfillmentTrackingFields(item, order, item.cancelledAt);
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "MARK_CANCELLED_ITEM_DAMAGED",
    oldStatus: "CANCELLATION_RECEIVED",
    newStatus: "CANCEL_DAMAGED",
  });
  return order.toObject();
}

export async function markCancelledOrderItemLost({ orderId, itemId, actorId, actorRole = "CANCELLATION_MANAGER", expectedStatus = "" }) {
  if (!mongoose.isValidObjectId(orderId)) throw createHttpError("Order not found", 404);
  const order = await CustomerOrder.findById(orderId);
  assertAdminOrderActionable(order);
  const item = getOrderItemOrThrow(order, itemId);
  assertExpectedStatus(item, expectedStatus);
  const status = normalizeItemFulfillmentStatus(item.fulfillmentStatus, "RESERVED");
  if (!["HANDED_TO_CANCELLATION", "CANCELLATION_RECEIVED"].includes(status)) {
    throw createHttpError("Only cancellation handover items can be marked lost", 409);
  }

  const operation = getValidatedStockOperation(item, "This cancelled item cannot be marked lost because stock data is incomplete");
  await markCancelledStockLost(operation);
  await createInventoryLedgerEntry({
    item,
    orderId: order._id,
    movementType: "MARK_CANCELLED_ITEM_LOST",
    quantity: operation.quantity,
    reservedChange: -operation.quantity,
    lostChange: operation.quantity,
    userId: actorId,
    referenceType: "CANCELLATION",
    referenceId: itemId,
  });
  await createInventoryMovementAuditLog({
    item,
    orderId: order._id,
    actorId,
    actorRole,
    action: "INVENTORY_MARKED_LOST",
    quantity: operation.quantity,
    reservedChange: -operation.quantity,
    lostChange: operation.quantity,
    referenceType: "CANCELLATION",
    referenceId: itemId,
  });

  const openHandover = await PhysicalHandover.findOne({
    orderItemId: itemId,
    type: "CURRENT_OWNER_TO_CANCELLATION",
    status: "PENDING_RECEIPT",
  });
  if (openHandover) {
    openHandover.status = "LOST_IN_HANDOVER";
    openHandover.receivedByUserId = getActorId(actorId);
    openHandover.receivedAt = new Date();
    await openHandover.save();
  }

  const caseDoc = await getOpenCancellationCase(itemId);
  await closeCancellationCase(caseDoc, actorId, "LOST");

  item.fulfillmentStatus = "CANCEL_LOST";
  item.physicalOwner = "NONE";
  item.cancellationClosedAt = new Date();
  item.cancellationClosedBy = getActorId(actorId);
  item.cancelledAt = new Date();
  syncDerivedFulfillmentTrackingFields(item, order, item.cancelledAt);
  applyDerivedOrderState(order);
  await order.save();
  await createAuditLog({
    orderId: order._id,
    itemId,
    userId: actorId,
    role: actorRole,
    action: "MARK_CANCELLED_ITEM_LOST",
    oldStatus: status,
    newStatus: "CANCEL_LOST",
  });
  return order.toObject();
}
