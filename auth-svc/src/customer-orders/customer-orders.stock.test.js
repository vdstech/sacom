import test from "node:test";
import assert from "node:assert/strict";
import { reserveStockEntry, resolveAvailableStockQuantity } from "./customer-orders.stock.js";
import StorefrontInventoryRead from "./customer-orders.storefront-inventory.model.js";
import StorefrontVariantRead from "./customer-orders.storefront-variant.model.js";

test("available stock falls back to legacy quantity-only rows when canonical quantity is missing", () => {
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
    0
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

test("availableQty remains canonical even when legacy quantity is higher", () => {
  assert.equal(
    resolveAvailableStockQuantity({
      quantity: 10,
      availableQty: 4,
      reservedQty: 0,
      damagedQty: 0,
      lostQty: 0,
    }),
    4
  );
});

test("hydrated legacy inventory documents still fall back to quantity when availableQty is absent in Mongo", () => {
  const legacyInventoryDoc = StorefrontInventoryRead.hydrate({
    _id: "69da324e76c4fe241dad9484",
    stockKey: "STK-F4D52B44",
    productId: "69da28deb1e8a36b7ed0be80",
    variantId: "69da2e2ecf3311b7f4d52b46",
    sizeLabel: "38",
    quantity: 2,
    reorderLevel: 0,
  });

  assert.equal(legacyInventoryDoc.availableQty, 0);
  assert.equal(legacyInventoryDoc.$isDefault("availableQty"), true);
  assert.equal(resolveAvailableStockQuantity(legacyInventoryDoc), 2);
});

test("reserveStockEntry succeeds for legacy inventory rows that only persist quantity", async () => {
  const productId = "69da28deb1e8a36b7ed0be80";
  const variantId = "69da2e2ecf3311b7f4d52b46";
  const stockKey = "STK-F4D52B44";
  const inventoryDoc = StorefrontInventoryRead.hydrate({
    _id: "69da324e76c4fe241dad9484",
    stockKey,
    productId,
    variantId,
    sizeLabel: "38",
    quantity: 2,
    reorderLevel: 0,
  });
  inventoryDoc.save = async function save() {
    return this;
  };

  const variantDoc = StorefrontVariantRead.hydrate({
    _id: variantId,
    productId,
    isActive: true,
    stock: [{ stockKey, quantity: 2 }],
  });
  variantDoc.save = async function save() {
    return this;
  };

  const originals = {
    inventoryFindOne: StorefrontInventoryRead.findOne,
    variantFindOne: StorefrontVariantRead.findOne,
  };

  StorefrontInventoryRead.findOne = async () => inventoryDoc;
  StorefrontVariantRead.findOne = async () => variantDoc;

  try {
    await reserveStockEntry({ productId, variantId, stockKey, quantity: 1 });
    assert.equal(inventoryDoc.quantity, 1);
    assert.equal(inventoryDoc.availableQty, 1);
    assert.equal(inventoryDoc.reservedQty, 1);
    assert.equal(variantDoc.stock[0].quantity, 1);
    assert.equal(variantDoc.stock[0].availableQty, 1);
    assert.equal(variantDoc.stock[0].reservedQty, 1);
  } finally {
    StorefrontInventoryRead.findOne = originals.inventoryFindOne;
    StorefrontVariantRead.findOne = originals.variantFindOne;
  }
});
