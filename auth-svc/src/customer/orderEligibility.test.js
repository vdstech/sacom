import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReturnEligibility, shouldAutoDeliverItem } from "./orderEligibility.js";

test("return eligibility requires delivered status", () => {
  const result = evaluateReturnEligibility({
    item: { fulfillmentStatus: "shipped", deliveredAt: null },
    returnPolicy: { returnable: true, windowDays: 7 },
    now: new Date("2026-04-25T12:00:00.000Z"),
  });

  assert.equal(result.returnEligible, false);
  assert.equal(result.reason, "not_delivered");
});

test("return eligibility rejects non-returnable products", () => {
  const result = evaluateReturnEligibility({
    item: { fulfillmentStatus: "delivered", deliveredAt: "2026-04-24T12:00:00.000Z" },
    returnPolicy: { returnable: false, windowDays: 0 },
    now: new Date("2026-04-25T12:00:00.000Z"),
  });

  assert.equal(result.returnEligible, false);
  assert.equal(result.reason, "non_returnable");
});

test("return eligibility rejects expired return windows", () => {
  const result = evaluateReturnEligibility({
    item: { fulfillmentStatus: "delivered", deliveredAt: "2026-04-01T12:00:00.000Z" },
    returnPolicy: { returnable: true, windowDays: 7 },
    now: new Date("2026-04-25T12:00:00.000Z"),
  });

  assert.equal(result.returnEligible, false);
  assert.equal(result.reason, "expired");
});

test("return eligibility allows delivered items inside the live window", () => {
  const result = evaluateReturnEligibility({
    item: { fulfillmentStatus: "delivered", deliveredAt: "2026-04-24T12:00:00.000Z" },
    returnPolicy: { returnable: true, windowDays: 7 },
    now: new Date("2026-04-25T12:00:00.000Z"),
  });

  assert.equal(result.returnEligible, true);
  assert.equal(result.reason, "");
  assert.ok(result.returnWindowEndsAt instanceof Date);
});

test("auto delivery triggers only after shipped items are older than thirty minutes", () => {
  assert.equal(
    shouldAutoDeliverItem(
      { fulfillmentStatus: "shipped", shippedAt: "2026-04-25T11:20:00.000Z" },
      new Date("2026-04-25T12:00:00.000Z")
    ),
    true
  );

  assert.equal(
    shouldAutoDeliverItem(
      { fulfillmentStatus: "shipped", shippedAt: "2026-04-25T11:40:00.000Z" },
      new Date("2026-04-25T12:00:00.000Z")
    ),
    false
  );
});
