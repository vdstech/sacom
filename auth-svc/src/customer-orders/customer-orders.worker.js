import CustomerOrder from "./customer-orders.model.js";
import OrderItemEscalation from "./customer-orders.escalation.model.js";
import {
  expireActiveCoupons,
  expireCheckoutSessionsAndReservations,
} from "./customer-orders.checkout.service.js";
import { purgeExpiredAuditLogs } from "../audit/audit.service.js";
import { shouldAutoDeliverItem } from "./customer-orders.eligibility.js";
import {
  buildOrderItemId,
  deriveLaneAssignedAt,
  deriveLastActionedAt,
  deriveTargetCompletionDate,
  getItemHoursInLane,
  isTrackedFulfillmentLane,
  normalizeSlaStatus,
  resolveFulfillmentLaneKey,
  resolveFulfillmentStage,
  resolveItemSlaStatus,
  resolveOrderFulfillmentStatus,
  resolveOrderPaymentStatus,
} from "./customer-orders.shared.js";

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

export function buildFulfillmentEscalationReason(item) {
  const stage = resolveFulfillmentStage(item);
  return `${stage} lane exceeded 48 hours without completion`;
}

export async function syncFulfillmentEscalations({ now = new Date() } = {}) {
  const orders = await CustomerOrder.find({}).sort({ placedAt: 1, createdAt: 1 });
  if (!orders.length) {
    return { ordersUpdated: 0, itemsUpdated: 0, escalationsOpened: 0, escalationsResolved: 0 };
  }

  const itemIds = orders.flatMap((order) => (order.items || []).map((item, index) => buildOrderItemId(item, index)));
  const openEscalations = await OrderItemEscalation.find({
    orderItemId: { $in: itemIds },
    status: "OPEN",
  }).sort({ createdAt: -1 });
  const openEscalationsByItem = new Map();
  for (const escalation of openEscalations) {
    const key = String(escalation.orderItemId || "");
    const list = openEscalationsByItem.get(key) || [];
    list.push(escalation);
    openEscalationsByItem.set(key, list);
  }

  let ordersUpdated = 0;
  let itemsUpdated = 0;
  let escalationsOpened = 0;
  let escalationsResolved = 0;

  for (const order of orders) {
    let orderChanged = false;
    const placedAt = order.placedAt || now;

    for (const [index, item] of (order.items || []).entries()) {
      let itemChanged = false;
      const itemId = buildOrderItemId(item, index);
      const stage = resolveFulfillmentStage(item);
      const lane = resolveFulfillmentLaneKey(item);
      const targetCompletionDate = deriveTargetCompletionDate(item, placedAt);
      const laneAssignedAt = deriveLaneAssignedAt(item, placedAt);
      const lastActionedAt = deriveLastActionedAt(item, placedAt);
      const currentOpenEscalations = openEscalationsByItem.get(itemId) || [];
      const matchingOpenEscalation = currentOpenEscalations.find((entry) => String(entry.lane || "") === lane) || null;
      const slaStatus = resolveItemSlaStatus(item, {
        orderPlacedAt: placedAt,
        now,
        activeEscalation: matchingOpenEscalation,
      });

      const nextTargetCompletionIso = targetCompletionDate?.toISOString() || null;
      const nextLaneAssignedIso = laneAssignedAt?.toISOString() || null;
      const nextLastActionedIso = lastActionedAt?.toISOString() || null;

      if ((item.targetCompletionDate?.toISOString?.() || null) !== nextTargetCompletionIso) {
        item.targetCompletionDate = targetCompletionDate || null;
        orderChanged = true;
        itemChanged = true;
      }
      if ((item.laneAssignedAt?.toISOString?.() || null) !== nextLaneAssignedIso) {
        item.laneAssignedAt = laneAssignedAt || null;
        orderChanged = true;
        itemChanged = true;
      }
      if ((item.lastActionedAt?.toISOString?.() || null) !== nextLastActionedIso) {
        item.lastActionedAt = lastActionedAt || null;
        orderChanged = true;
        itemChanged = true;
      }
      if (normalizeSlaStatus(item.slaStatus, "ON_TRACK") !== normalizeSlaStatus(slaStatus, "ON_TRACK")) {
        item.slaStatus = normalizeSlaStatus(slaStatus, "ON_TRACK");
        orderChanged = true;
        itemChanged = true;
      }
      if (itemChanged) itemsUpdated += 1;

      const shouldEscalate = isTrackedFulfillmentLane(stage) && normalizeSlaStatus(slaStatus, "ON_TRACK") === "VIOLATED";
      if (shouldEscalate) {
        const hoursPending = getItemHoursInLane(item, { orderPlacedAt: placedAt, now });
        const reason = buildFulfillmentEscalationReason(item);
        if (matchingOpenEscalation) {
          matchingOpenEscalation.hoursPending = hoursPending;
          matchingOpenEscalation.reason = reason;
          matchingOpenEscalation.responsibleOwner = String(item.physicalOwner || "");
          await matchingOpenEscalation.save();
        } else {
          await OrderItemEscalation.create({
            orderId: order._id,
            orderItemId: itemId,
            lane,
            responsibleOwner: String(item.physicalOwner || ""),
            triggeredAt: now,
            hoursPending,
            reason,
            status: "OPEN",
          });
          escalationsOpened += 1;
        }
      }

      for (const escalation of currentOpenEscalations) {
        const escalationLane = String(escalation.lane || "");
        if (shouldEscalate && escalationLane === lane) continue;
        escalation.status = "RESOLVED";
        escalation.resolvedAt = now;
        await escalation.save();
        escalationsResolved += 1;
      }
    }

    if (orderChanged) {
      applyDerivedOrderState(order);
      await order.save();
      ordersUpdated += 1;
    }
  }

  return { ordersUpdated, itemsUpdated, escalationsOpened, escalationsResolved };
}

export function startOrderDeliveryWorker(logger, { intervalMs = 60 * 1000 } = {}) {
  const auditCleanupIntervalMs = Math.max(60_000, Number(process.env.AUDIT_LOG_CLEANUP_INTERVAL_MS || 24 * 60 * 60 * 1000));
  let lastAuditCleanupStartedAt = 0;

  const run = async () => {
    try {
      const result = await markEligibleShippedItemsDelivered();
      if (result.itemsUpdated > 0) logger?.info?.({ ...result }, "Auto-delivered shipped order items");
      const escalationResult = await syncFulfillmentEscalations();
      if ((escalationResult.itemsUpdated || 0) > 0 || (escalationResult.escalationsOpened || 0) > 0 || (escalationResult.escalationsResolved || 0) > 0) {
        logger?.info?.({ ...escalationResult }, "Synchronized fulfillment SLAs and escalations");
      }
      const expiryResult = await expireCouponAndCheckoutArtifacts();
      if ((expiryResult.expiredSessions || 0) > 0 || (expiryResult.expiredCoupons || 0) > 0) {
        logger?.info?.({ ...expiryResult }, "Expired checkout sessions or coupons");
      }

      if (Date.now() - lastAuditCleanupStartedAt >= auditCleanupIntervalMs) {
        lastAuditCleanupStartedAt = Date.now();
        const cleanupResult = await purgeExpiredAuditLogs();
        if ((cleanupResult.deletedCount || 0) > 0) {
          logger?.info?.({ ...cleanupResult }, "Deleted expired audit log entries");
        }
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
