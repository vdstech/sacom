import CustomerOrder from "./models/customerOrderModel.js";
import { shouldAutoDeliverItem } from "./orderEligibility.js";
import { resolveOrderFulfillmentStatus, resolveOrderPaymentStatus } from "./orderShared.js";

function applyDerivedOrderState(order) {
  order.fulfillmentStatus = resolveOrderFulfillmentStatus(order);
  order.paymentStatus = resolveOrderPaymentStatus(order);
  order.status = ["cancelled", "cancelled_by_admin"].includes(order.fulfillmentStatus)
    ? order.fulfillmentStatus
    : "placed";
}

export async function markEligibleShippedItemsDelivered({ now = new Date() } = {}) {
  const orders = await CustomerOrder.find({
    items: {
      $elemMatch: {
        fulfillmentStatus: "shipped",
        shippedAt: { $lte: new Date(now.getTime() - 30 * 60 * 1000) },
      },
    },
  });

  let ordersUpdated = 0;
  let itemsUpdated = 0;

  for (const order of orders) {
    let changed = false;
    for (const item of order.items || []) {
      if (!shouldAutoDeliverItem(item, now)) continue;
      item.fulfillmentStatus = "delivered";
      item.deliveredAt = item.deliveredAt || now;
      changed = true;
      itemsUpdated += 1;
    }

    if (!changed) continue;
    applyDerivedOrderState(order);
    await order.save();
    ordersUpdated += 1;
  }

  return { ordersUpdated, itemsUpdated };
}

export function startOrderDeliveryWorker(logger, { intervalMs = 60 * 1000 } = {}) {
  const run = async () => {
    try {
      const result = await markEligibleShippedItemsDelivered();
      if (result.itemsUpdated > 0) {
        logger?.info?.({ ...result }, "Auto-delivered shipped order items");
      }
    } catch (error) {
      logger?.error?.({ err: error }, "Order delivery worker failed");
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
