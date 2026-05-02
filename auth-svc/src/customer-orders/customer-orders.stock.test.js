import test from "node:test";
import assert from "node:assert/strict";
import { resolveAvailableStockQuantity } from "./customer-orders.stock.js";

test("available stock falls back to legacy quantity-only rows", () => {
  assert.equal(
    resolveAvailableStockQuantity({
      quantity: 5,
    }),
    5
  );

  assert.equal(
    resolveAvailableStockQuantity({
      quantity: 7,
      availableQty: 0,
      reservedQty: 0,
      damagedQty: 0,
      lostQty: 0,
    }),
    7
  );
});

test("available stock respects tracked allocation counters when present", () => {
  assert.equal(
    resolveAvailableStockQuantity({
      quantity: 7,
      availableQty: 3,
      reservedQty: 2,
      damagedQty: 0,
      lostQty: 0,
    }),
    3
  );
});

test("product-side quantity updates remain usable when no allocations exist", () => {
  assert.equal(
    resolveAvailableStockQuantity({
      quantity: 10,
      availableQty: 4,
      reservedQty: 0,
      damagedQty: 0,
      lostQty: 0,
    }),
    10
  );
});
