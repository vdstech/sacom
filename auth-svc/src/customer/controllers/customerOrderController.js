import CustomerOrder from "../models/customerOrderModel.js";
import StorefrontProductRead from "../models/storefrontProductReadModel.js";
import {
  cancelCustomerOrderAndRestock,
  cancelCustomerOrderItemAndRestock,
  createCustomerOrderFromCart,
  requestCustomerOrderItemReturn,
} from "../services/customerCheckoutService.js";
import { mapOrder, normalizePaymentStatus } from "../orderShared.js";
import { evaluateReturnEligibility } from "../orderEligibility.js";

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

function decorateMappedOrder(order, returnPolicyMap) {
  return {
    ...order,
    items: (order.items || []).map((item) => {
      const productId = String(item.productId || "").trim();
      const returnPolicy = productId ? returnPolicyMap.get(productId) || null : null;
      const eligibility = evaluateReturnEligibility({ item, returnPolicy });
      return {
        ...item,
        returnEligible: eligibility.returnEligible,
        returnEligibilityReason: eligibility.reason || "",
        returnWindowEndsAt: eligibility.returnWindowEndsAt ? eligibility.returnWindowEndsAt.toISOString() : null,
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
  return res.json({ orders: mappedOrders.map((order) => decorateMappedOrder(order, returnPolicyMap)) });
}

export async function getOrder(req, res) {
  const order = await CustomerOrder.findOne({ _id: req.params.id, customer: req.customerAuth.customerId }).lean();
  if (!order) return res.status(404).json({ error: "Order not found" });
  const mappedOrder = mapOrder(order);
  const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
  return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap) });
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
    return res.status(201).json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap) });
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
    return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap) });
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
    return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap) });
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
    });
    const mappedOrder = mapOrder(order);
    const returnPolicyMap = await buildReturnPolicyMap([mappedOrder]);
    return res.json({ order: decorateMappedOrder(mappedOrder, returnPolicyMap) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Unable to request a return for this item" });
  }
}
