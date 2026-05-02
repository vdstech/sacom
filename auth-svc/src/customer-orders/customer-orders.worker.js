import CustomerOrder from "./customer-orders.model.js";
import { shouldAutoDeliverItem } from "./customer-orders.eligibility.js";
import { resolveOrderFulfillmentStatus, resolveOrderPaymentStatus } from "./customer-orders.shared.js";

function applyDerivedOrderState(order) {
  order.fulfillmentStatus = resolveOrderFulfillmentStatus(order);
  order.paymentStatus = resolveOrderPaymentStatus(order);
  order.status = ["cancelled", "cancelled_by_admin"].includes(order.fulfillmentStatus)
    ? order.fulfillmentStatus
    : "placed";
}

export async function markEligibleShippedItemsDelivered({ now = new Date() } = {}) {
  void now;
  void CustomerOrder;
  void shouldAutoDeliverItem;
  void applyDerivedOrderState;
  return { ordersUpdated: 0, itemsUpdated: 0 };
}

export function startOrderDeliveryWorker(logger, { intervalMs = 60 * 1000 } = {}) {
  const run = async () => {
    try {
      const result = await markEligibleShippedItemsDelivered();
      if (result.itemsUpdated > 0) logger?.info?.({ ...result }, "Auto-delivered shipped order items");
    } catch (error) {
      logger?.error?.({ err: error }, "Order delivery worker failed");
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
