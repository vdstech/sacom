import test from "node:test";
import assert from "node:assert/strict";
import { laneMatchesItem } from "./customer-orders.admin.controller.js";

test("processing lane keeps picked cancelled items with the processing manager", () => {
  const item = {
    fulfillmentStatus: "CANCEL_REQUESTED",
    physicalOwner: "PROCESSING_MANAGER",
  };

  assert.equal(laneMatchesItem("processing", item), true);
  assert.equal(laneMatchesItem("packaging", item), false);
  assert.equal(laneMatchesItem("shipping", item), false);
  assert.equal(laneMatchesItem("cancellations", item), false);
});

test("shipping lane keeps cancelled items pending shipping receipt actionable for shipping", () => {
  const item = {
    fulfillmentStatus: "CANCEL_REQUESTED",
    physicalOwner: "PACKAGING_MANAGER",
    pendingHandover: {
      type: "PACKAGING_TO_SHIPPING",
      status: "PENDING_RECEIPT",
    },
  };

  assert.equal(laneMatchesItem("shipping", item), true);
  assert.equal(laneMatchesItem("packaging", item), false);
  assert.equal(laneMatchesItem("cancellations", item), false);
});

test("shipping-rejected cancelled items return to packaging ownership", () => {
  const item = {
    fulfillmentStatus: "CANCEL_REQUESTED",
    physicalOwner: "PACKAGING_MANAGER",
    pendingHandover: {
      type: "PACKAGING_TO_SHIPPING",
      status: "REJECTED",
    },
  };

  assert.equal(laneMatchesItem("processing", item), false);
  assert.equal(laneMatchesItem("packaging", item), true);
  assert.equal(laneMatchesItem("shipping", item), false);
  assert.equal(laneMatchesItem("cancellations", item), false);
});

test("shipping-owned cancelled items stay in shipping until handed to cancellation", () => {
  const item = {
    fulfillmentStatus: "CANCEL_REQUESTED",
    physicalOwner: "SHIPPING_OPERATOR",
  };

  assert.equal(laneMatchesItem("shipping", item), true);
  assert.equal(laneMatchesItem("cancellations", item), false);
});

test("only handed-over cancellation items appear in the cancellation lane", () => {
  assert.equal(laneMatchesItem("cancellations", { fulfillmentStatus: "CANCEL_REQUESTED", physicalOwner: "CANCELLATION_MANAGER" }), false);
  assert.equal(laneMatchesItem("cancellations", { fulfillmentStatus: "HANDED_TO_CANCELLATION" }), true);
  assert.equal(laneMatchesItem("cancellations", { fulfillmentStatus: "CANCELLATION_RECEIVED" }), true);
});
