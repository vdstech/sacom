import CustomerOrder from "../models/customerOrderModel.js";

function mapOrder(order) {
  return {
    id: String(order._id),
    placedAt: order.placedAt,
    status: order.status,
    itemCount: Number(order.itemCount || 0),
    total: Number(order.total || 0),
    currency: order.currency || "INR",
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          productId: item.productId ? String(item.productId) : "",
          slug: item.slug || "",
          title: item.title || "",
          imageUrl: item.imageUrl || "",
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          lineTotal: Number(item.lineTotal || 0),
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
