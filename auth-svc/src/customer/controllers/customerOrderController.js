import CustomerOrder from "../models/customerOrderModel.js";

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function mapOrder(order) {
  const grandTotal = asNumber(order.grandTotal, asNumber(order.total, 0));
  return {
    id: String(order._id),
    placedAt: order.placedAt,
    status: order.status,
    paymentStatus: order.paymentStatus || "pending",
    fulfillmentStatus: order.fulfillmentStatus || "pending",
    itemCount: Number(order.itemCount || 0),
    subtotal: asNumber(order.subtotal, 0),
    discountTotal: asNumber(order.discountTotal, 0),
    shippingTotal: asNumber(order.shippingTotal, 0),
    taxTotal: asNumber(order.taxTotal, 0),
    grandTotal,
    total: grandTotal,
    currency: order.currency || "INR",
    pricingVersion: asNumber(order.pricingVersion, 1),
    couponCode: order.couponCode || "",
    paymentReference: order.paymentReference || "",
    addressSnapshot: order.addressSnapshot
      ? {
          fullName: order.addressSnapshot.fullName || "",
          phone: order.addressSnapshot.phone || "",
          line1: order.addressSnapshot.line1 || "",
          line2: order.addressSnapshot.line2 || "",
          city: order.addressSnapshot.city || "",
          state: order.addressSnapshot.state || "",
          postalCode: order.addressSnapshot.postalCode || "",
          country: order.addressSnapshot.country || "",
        }
      : null,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          productId: item.productId ? String(item.productId) : "",
          variantId: item.variantId ? String(item.variantId) : "",
          stockKey: item.stockKey || "",
          slug: item.slug || "",
          title: item.title || "",
          imageUrl: item.imageUrl || "",
          quantity: Number(item.quantity || 0),
          currency: item.currency || order.currency || "INR",
          listUnitPrice: asNumber(item.listUnitPrice, asNumber(item.unitPrice, 0)),
          catalogDiscountType: item.catalogDiscountType || "none",
          catalogDiscountValue: asNumber(item.catalogDiscountValue, 0),
          catalogDiscountLabel: item.catalogDiscountLabel || "",
          catalogDiscountAmount: asNumber(item.catalogDiscountAmount, 0),
          promoDiscountType: item.promoDiscountType || "none",
          promoDiscountValue: asNumber(item.promoDiscountValue, 0),
          promoDiscountLabel: item.promoDiscountLabel || "",
          promoDiscountAmount: asNumber(item.promoDiscountAmount, 0),
          finalUnitPrice: asNumber(item.finalUnitPrice, asNumber(item.unitPrice, 0)),
          unitPrice: asNumber(item.finalUnitPrice, asNumber(item.unitPrice, 0)),
          lineSubtotal: asNumber(item.lineSubtotal, 0),
          lineTaxTotal: asNumber(item.lineTaxTotal, 0),
          lineShippingTotal: asNumber(item.lineShippingTotal, 0),
          lineDiscountTotal: asNumber(item.lineDiscountTotal, 0),
          lineGrandTotal: asNumber(item.lineGrandTotal, asNumber(item.lineTotal, 0)),
          lineTotal: asNumber(item.lineGrandTotal, asNumber(item.lineTotal, 0)),
        }))
      : [],
  };
}

export async function listOrders(req, res) {
  const orders = await CustomerOrder.find({ customer: req.customerAuth.customerId })
    .sort({ placedAt: -1, createdAt: -1 })
    .lean();
  return res.json({ orders: orders.map(mapOrder) });
}

export async function getOrder(req, res) {
  const order = await CustomerOrder.findOne({ _id: req.params.id, customer: req.customerAuth.customerId }).lean();
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json({ order: mapOrder(order) });
}
