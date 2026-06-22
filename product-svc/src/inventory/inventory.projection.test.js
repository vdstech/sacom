import test from "node:test";
import assert from "node:assert/strict";
import { overlayVariantStockWithInventory, resolveCanonicalAvailableQuantity } from "./inventory.projection.js";

test("resolveCanonicalAvailableQuantity prefers availableQty over legacy quantity", () => {
  assert.equal(resolveCanonicalAvailableQuantity({ quantity: 8, availableQty: 3 }), 3);
  assert.equal(resolveCanonicalAvailableQuantity({ quantity: 8 }), 8);
});

test("overlayVariantStockWithInventory replaces stale variant projection with canonical inventory values", () => {
  const variant = overlayVariantStockWithInventory(
    {
      _id: "variant-1",
      stock: [
        {
          stockKey: "SKU-1",
          sizeLabel: "M",
          quantity: 9,
          availableQty: 9,
          reservedQty: 0,
          damagedQty: 0,
          lostQty: 0,
          reorderLevel: 1,
        },
      ],
    },
    [
      {
        stockKey: "SKU-1",
        sizeLabel: "M",
        quantity: 2,
        availableQty: 2,
        reservedQty: 4,
        damagedQty: 1,
        lostQty: 0,
        reorderLevel: 3,
      },
    ]
  );

  assert.equal(variant.projectionMismatch, true);
  assert.equal(variant.stock[0].quantity, 2);
  assert.equal(variant.stock[0].availableQty, 2);
  assert.equal(variant.stock[0].reservedQty, 4);
  assert.equal(variant.stock[0].damagedQty, 1);
  assert.equal(variant.stock[0].reorderLevel, 3);
});
