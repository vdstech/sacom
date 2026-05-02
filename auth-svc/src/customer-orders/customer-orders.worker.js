import CustomerOrder from "./customer-orders.model.js";
import {
  expireActiveCoupons,
  expireCheckoutSessionsAndReservations,
} from "./customer-orders.checkout.service.js";
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

export async function expireCouponAndCheckoutArtifacts({ now = new Date() } = {}) {
  const [sessionResult, couponResult] = await Promise.all([
    expireCheckoutSessionsAndReservations({ now }),
    expireActiveCoupons({ now }),
  ]);
  return {
    expiredSessions: sessionResult.expiredSessions || 0,
    expiredCoupons: couponResult.expiredCoupons || 0,
  };
}

export function startOrderDeliveryWorker(logger, { intervalMs = 60 * 1000 } = {}) {
  const run = async () => {
    try {
      const result = await markEligibleShippedItemsDelivered();
      if (result.itemsUpdated > 0) logger?.info?.({ ...result }, "Auto-delivered shipped order items");
      const expiryResult = await expireCouponAndCheckoutArtifacts();
      if ((expiryResult.expiredSessions || 0) > 0 || (expiryResult.expiredCoupons || 0) > 0) {
        logger?.info?.({ ...expiryResult }, "Expired checkout sessions or coupons");
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
