import { normalizeItemFulfillmentStatus } from "./customer-orders.shared.js";

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

export function computeReturnWindowEndsAt(deliveredAt, windowDays) {
  const deliveredDate = asDate(deliveredAt);
  const numericWindow = Math.max(0, asNumber(windowDays, 0));
  if (!deliveredDate || numericWindow < 1) return null;
  return new Date(deliveredDate.getTime() + numericWindow * 24 * 60 * 60 * 1000);
}

export function evaluateReturnEligibility({ item, returnPolicy, now = new Date() }) {
  const normalizedStatus = normalizeItemFulfillmentStatus(item?.fulfillmentStatus, "");
  if (normalizedStatus !== "DELIVERED") {
    return { returnEligible: false, reason: "not_delivered", returnWindowEndsAt: null };
  }

  const deliveredAt = asDate(item?.deliveredAt);
  if (!deliveredAt) {
    return { returnEligible: false, reason: "not_delivered", returnWindowEndsAt: null };
  }

  if (!returnPolicy?.returnable) {
    return { returnEligible: false, reason: "non_returnable", returnWindowEndsAt: null };
  }

  const returnWindowEndsAt = computeReturnWindowEndsAt(deliveredAt, returnPolicy?.windowDays);
  if (!returnWindowEndsAt) {
    return { returnEligible: false, reason: "window_missing", returnWindowEndsAt: null };
  }

  const currentTime = asDate(now) || new Date();
  if (currentTime.getTime() > returnWindowEndsAt.getTime()) {
    return { returnEligible: false, reason: "expired", returnWindowEndsAt };
  }

  return { returnEligible: true, reason: "", returnWindowEndsAt };
}

export function shouldAutoDeliverItem(item, now = new Date()) {
  void item;
  void now;
  return false;
}
