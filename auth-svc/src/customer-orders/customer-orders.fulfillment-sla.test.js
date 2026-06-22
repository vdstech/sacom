import test from "node:test";
import assert from "node:assert/strict";
import { buildFulfillmentEscalationReason } from "./customer-orders.worker.js";
import { resolveItemSlaStatus } from "./customer-orders.shared.js";

test("resolveItemSlaStatus marks processing items delayed after 24 hours without action", () => {
  const now = new Date("2026-05-10T12:00:00.000Z");
  const item = {
    fulfillmentStatus: "PICKED_FROM_WAREHOUSE",
    physicalOwner: "PROCESSING_MANAGER",
    laneAssignedAt: "2026-05-09T16:00:00.000Z",
    lastActionedAt: "2026-05-09T10:00:00.000Z",
  };

  assert.equal(resolveItemSlaStatus(item, { orderPlacedAt: "2026-05-08T10:00:00.000Z", now }), "DELAYED");
});

test("resolveItemSlaStatus marks tracked items violated after 48 hours in lane", () => {
  const now = new Date("2026-05-10T12:00:00.000Z");
  const item = {
    fulfillmentStatus: "PACKAGING_IN_PROGRESS",
    physicalOwner: "PACKAGING_MANAGER",
    laneAssignedAt: "2026-05-08T08:00:00.000Z",
    lastActionedAt: "2026-05-10T08:00:00.000Z",
  };

  assert.equal(resolveItemSlaStatus(item, { orderPlacedAt: "2026-05-07T10:00:00.000Z", now }), "VIOLATED");
});

test("resolveItemSlaStatus does not escalate shipped items", () => {
  const now = new Date("2026-05-10T12:00:00.000Z");
  const item = {
    fulfillmentStatus: "SHIPPED",
    physicalOwner: "COURIER",
    laneAssignedAt: "2026-05-07T08:00:00.000Z",
    lastActionedAt: "2026-05-07T08:00:00.000Z",
  };

  assert.equal(resolveItemSlaStatus(item, { orderPlacedAt: "2026-05-06T10:00:00.000Z", now }), "ON_TRACK");
});

test("buildFulfillmentEscalationReason uses the current fulfillment lane", () => {
  const item = {
    fulfillmentStatus: "SHIPPING_IN_PROGRESS",
    physicalOwner: "SHIPPING_OPERATOR",
  };

  assert.equal(buildFulfillmentEscalationReason(item), "Shipping lane exceeded 48 hours without completion");
});
