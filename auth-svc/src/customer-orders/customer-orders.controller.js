import CustomerOrder from "./customer-orders.model.js";
import StorefrontProductRead from "./customer-orders.storefront-product.model.js";
import ReturnExchangeCase from "./customer-orders.return-exchange-case.model.js";
import {
  cancelCustomerOrderAndRestock,
  cancelCustomerOrderItemAndRestock,
  createCustomerOrderFromCart,
  requestCustomerOrderItemExchange,
  requestCustomerOrderItemReturn,
} from "./customer-orders.service.js";
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
  const mappedOrders = orders.map(mapOrder);
  const returnPolicyMap = await buildReturnPolicyMap(mappedOrders);
  const caseMap = await buildReturnExchangeCaseMap(mappedOrders);
  return res.json({ orders: mappedOrders.map((order) => decorateMappedOrder(order, returnPolicyMap, caseMap)) });
}

export async function getOrder(req, res) {
  const order = await CustomerOrder.findOne({ _id: req.params.id, customer: req.customerAuth.customerId }).lean();
  if (!order) return res.status(404).json({ error: "Order not found" });
  const mappedOrder = mapOrder(order);
  const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
  const caseMap = await buildReturnExchangeCaseMap([mappedOrder]);
  return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap, caseMap) });
}

export async function createOrder(req, res) {
  try {
    const paymentStatus = normalizePaymentStatus(req.body?.paymentStatus, "paid");
    if (!["paid", "payment_failed"].includes(paymentStatus)) {
      return res.status(400).json({ error: "paymentStatus must be paid or payment_failed" });
    }

    const order = await createCustomerOrderFromCart({
      customerId: req.customerAuth.customerId,
      cartToken: req.body?.cartToken,
      addressId: req.body?.addressId,
      paymentStatus,
    });
    const mappedOrder = mapOrder(order);
    const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
    const caseMap = await buildReturnExchangeCaseMap([mappedOrder]);
    return res.status(201).json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap, caseMap) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to create order" });
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
