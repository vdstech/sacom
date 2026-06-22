import CustomerOrder from "./customer-orders.model.js";
import StorefrontProductRead from "./customer-orders.storefront-product.model.js";
import ReturnExchangeCase from "./customer-orders.return-exchange-case.model.js";
import {
  cancelCustomerOrderAndRestock,
  cancelCustomerOrderItemAndRestock,
  requestCustomerOrderItemExchange,
  requestCustomerOrderItemReturn,
} from "./customer-orders.service.js";
import {
  abandonCheckoutSession,
  applyCheckoutCoupon,
  confirmCheckoutSession,
  createCheckoutSession,
  getCheckoutSession,
  listCustomerCoupons,
  removeCheckoutCoupon,
} from "./customer-orders.checkout.service.js";
import { buildOrderItemId, mapOrder, normalizePaymentStatus } from "./customer-orders.shared.js";
import { evaluateReturnEligibility } from "./customer-orders.eligibility.js";

async function buildReturnPolicyMap(orders) {
  const productIds = Array.from(
    new Set(
      orders
        .flatMap((order) => order.items || [])
        .map((item) => String(item.productId || "").trim())
        .filter(Boolean)
    )
  );

  if (!productIds.length) return new Map();

  const products = await StorefrontProductRead.find({ _id: { $in: productIds } })
    .select("_id returnPolicy")
    .lean();

  return new Map(products.map((product) => [String(product._id), product.returnPolicy || null]));
}

function excludeFailedPaymentOrders(orders = []) {
  return (Array.isArray(orders) ? orders : []).filter(
    (order) => normalizePaymentStatus(order?.paymentStatus, "pending") !== "payment_failed"
  );
}

async function buildReturnExchangeCaseMap(orders) {
  const itemIds = Array.from(
    new Set(
      orders
        .flatMap((order) => order.items || [])
        .map((item, index) => String(item?.id || buildOrderItemId(item, index)).trim())
        .filter(Boolean)
    )
  );

  if (!itemIds.length) return new Map();

  const cases = await ReturnExchangeCase.find({ orderItemId: { $in: itemIds } }).lean();
  return new Map(cases.map((caseDoc) => [String(caseDoc.orderItemId), caseDoc]));
}

function decorateMappedOrder(order, returnPolicyMap, caseMap) {
  return {
    ...order,
    items: (order.items || []).map((item, index) => {
      const productId = String(item.productId || "").trim();
      const returnPolicy = productId ? returnPolicyMap.get(productId) || null : null;
      const eligibility = evaluateReturnEligibility({ item, returnPolicy });
      const caseDoc = caseMap.get(String(item?.id || buildOrderItemId(item, index)).trim()) || null;
      const hasCase = !!caseDoc;
      const returnExchangeCase = caseDoc ? {
        caseId: String(caseDoc._id || ""),
        kind: String(caseDoc.kind || "").trim().toUpperCase(),
        status: String(caseDoc.status || "").trim().toUpperCase(),
        reason: String(caseDoc.reason || "").trim(),
        phoneNumber: String(caseDoc.phoneNumber || "").trim(),
        whatsappNumber: String(caseDoc.whatsappNumber || "").trim(),
        courierName: String(caseDoc.courierName || "").trim(),
        returnTrackingNumber: String(caseDoc.returnTrackingNumber || "").trim(),
        createdAt: caseDoc.createdAt || null,
        investigationStartedAt: caseDoc.investigationStartedAt || null,
        acceptedAt: caseDoc.acceptedAt || null,
        rejectedAt: caseDoc.rejectedAt || null,
        trackingUpdatedAt: caseDoc.trackingUpdatedAt || null,
        receivedAt: caseDoc.receivedAt || null,
        placeholderCreatedAt: caseDoc.placeholderCreatedAt || null,
        couponGeneratedAt: caseDoc.couponGeneratedAt || null,
      } : null;
      const blockReason = hasCase ? "case_exists" : (eligibility.reason || "");
      return {
        ...item,
        returnEligible: eligibility.returnEligible,
        returnEligibilityReason: eligibility.reason || "",
        returnWindowEndsAt: eligibility.returnWindowEndsAt ? eligibility.returnWindowEndsAt.toISOString() : null,
        canRequestReturn: eligibility.returnEligible && !hasCase,
        canRequestExchange: eligibility.returnEligible && !hasCase,
        returnExchangeBlockReason: blockReason,
        returnExchangeCase,
      };
    }),
  };
}

export async function listOrders(req, res) {
  const orders = await CustomerOrder.find({ customer: req.customerAuth.customerId })
    .sort({ placedAt: -1, createdAt: -1 })
    .lean();
  const mappedOrders = excludeFailedPaymentOrders(orders).map(mapOrder);
  const returnPolicyMap = await buildReturnPolicyMap(mappedOrders);
  const caseMap = await buildReturnExchangeCaseMap(mappedOrders);
  return res.json({ orders: mappedOrders.map((order) => decorateMappedOrder(order, returnPolicyMap, caseMap)) });
}

export async function getOrder(req, res) {
  const order = await CustomerOrder.findOne({ _id: req.params.id, customer: req.customerAuth.customerId }).lean();
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (normalizePaymentStatus(order?.paymentStatus, "pending") === "payment_failed") {
    return res.status(404).json({ error: "Order not found" });
  }
  const mappedOrder = mapOrder(order);
  const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
  const caseMap = await buildReturnExchangeCaseMap([mappedOrder]);
  return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap, caseMap) });
}

export async function createOrder(req, res) {
  return res.status(410).json({
    error: "Direct order creation is no longer supported. Create a checkout session and confirm payment instead.",
  });
}

export async function listCoupons(req, res) {
  try {
    const payload = await listCustomerCoupons({ customerId: req.customerAuth.customerId });
    return res.json(payload);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to load coupons" });
  }
}

export async function createSession(req, res) {
  try {
    const payload = await createCheckoutSession({
      customerId: req.customerAuth.customerId,
      cartToken: req.body?.cartToken,
    });
    return res.status(201).json(payload);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to create checkout session" });
  }
}

export async function getSession(req, res) {
  try {
    const payload = await getCheckoutSession({
      customerId: req.customerAuth.customerId,
      sessionId: req.params.sessionId,
    });
    return res.json(payload);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to load checkout session" });
  }
}

export async function applySessionCoupon(req, res) {
  try {
    const payload = await applyCheckoutCoupon({
      customerId: req.customerAuth.customerId,
      sessionId: req.params.sessionId,
      couponCode: req.body?.couponCode,
      idempotencyKey: req.headers["idempotency-key"],
    });
    return res.json(payload);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to apply coupon" });
  }
}

export async function removeSessionCoupon(req, res) {
  try {
    const payload = await removeCheckoutCoupon({
      customerId: req.customerAuth.customerId,
      sessionId: req.params.sessionId,
    });
    return res.json(payload);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to remove coupon" });
  }
}

export async function abandonSession(req, res) {
  try {
    const payload = await abandonCheckoutSession({
      customerId: req.customerAuth.customerId,
      sessionId: req.params.sessionId,
    });
    return res.json(payload);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to abandon checkout session" });
  }
}

export async function confirmSession(req, res) {
  try {
    const payload = await confirmCheckoutSession({
      customerId: req.customerAuth.customerId,
      sessionId: req.params.sessionId,
      addressId: req.body?.addressId,
      paymentStatus: req.body?.paymentStatus,
      idempotencyKey: req.headers["idempotency-key"],
    });
    const mappedOrder = mapOrder(payload.order);
    const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
    const caseMap = await buildReturnExchangeCaseMap([mappedOrder]);
    return res.json({
      ...payload,
      order: decorateMappedOrder(mappedOrder, returnPolicyMap, caseMap),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to confirm checkout session" });
  }
}

export async function cancelOrder(req, res) {
  try {
    const order = await cancelCustomerOrderAndRestock({
      customerId: req.customerAuth.customerId,
      orderId: req.params.id,
    });
    const mappedOrder = mapOrder(order);
    const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
    const caseMap = await buildReturnExchangeCaseMap([mappedOrder]);
    return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap, caseMap) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to cancel order" });
  }
}

export async function cancelOrderItem(req, res) {
  try {
    const order = await cancelCustomerOrderItemAndRestock({
      customerId: req.customerAuth.customerId,
      orderId: req.params.id,
      itemId: req.params.itemId,
    });
    const mappedOrder = mapOrder(order);
    const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
    const caseMap = await buildReturnExchangeCaseMap([mappedOrder]);
    return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap, caseMap) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to cancel this order item" });
  }
}

export async function requestOrderItemReturn(req, res) {
  try {
    const order = await requestCustomerOrderItemReturn({
      customerId: req.customerAuth.customerId,
      orderId: req.params.id,
      itemId: req.params.itemId,
      reason: req.body?.reason,
      phoneNumber: req.body?.phoneNumber,
      whatsappNumber: req.body?.whatsappNumber,
    });
    const mappedOrder = mapOrder(order);
    const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
    const caseMap = await buildReturnExchangeCaseMap([mappedOrder]);
    return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap, caseMap) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to request a return for this item" });
  }
}

export async function requestOrderItemExchange(req, res) {
  try {
    const order = await requestCustomerOrderItemExchange({
      customerId: req.customerAuth.customerId,
      orderId: req.params.id,
      itemId: req.params.itemId,
      reason: req.body?.reason,
      phoneNumber: req.body?.phoneNumber,
      whatsappNumber: req.body?.whatsappNumber,
    });
    const mappedOrder = mapOrder(order);
    const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
    const caseMap = await buildReturnExchangeCaseMap([mappedOrder]);
    return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap, caseMap) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to request an exchange for this item" });
  }
}
