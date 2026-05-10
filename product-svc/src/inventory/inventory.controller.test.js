import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  buildInventoryDashboardSummary,
  buildInventoryListResponse,
  buildInventorySearchClause,
  resolveAvailableQuantity,
} from "./inventory.controller.js";

test("buildInventorySearchClause matches stock key and size label text", () => {
  const clause = buildInventorySearchClause("stk-42");

  assert.equal(Array.isArray(clause?.$or), true);
  assert.equal(clause.$or.length, 2);
  assert.equal(clause.$or[0].stockKey.test("STK-42"), true);
  assert.equal(clause.$or[1].sizeLabel.test("stk-42"), true);
});

test("buildInventorySearchClause includes product matches for product title searches", () => {
  const productId = new mongoose.Types.ObjectId();
  const clause = buildInventorySearchClause("garden vareli", [productId]);

  assert.equal(clause.$or.length, 3);
  assert.deepEqual(clause.$or[2], { productId: { $in: [productId] } });
});

test("buildInventorySearchClause includes product matches for product slug searches", () => {
  const productId = new mongoose.Types.ObjectId();
  const clause = buildInventorySearchClause("plain-nara-chiffon", [productId]);

  assert.equal(clause.$or.length, 3);
  assert.deepEqual(clause.$or[2], { productId: { $in: [productId] } });
});

test("buildInventorySearchClause composes with category product filters without replacing them", () => {
  const categoryProductId = new mongoose.Types.ObjectId();
  const outsideCategoryProductId = new mongoose.Types.ObjectId();
  const filter = {
    productId: { $in: [categoryProductId] },
    ...buildInventorySearchClause("garden", [categoryProductId, outsideCategoryProductId]),
  };

  assert.deepEqual(filter.productId, { $in: [categoryProductId] });
  assert.deepEqual(filter.$or[2], {
    productId: { $in: [categoryProductId, outsideCategoryProductId] },
  });
});

test("buildInventoryListResponse keeps totalPages at 1 for empty results", () => {
  assert.deepEqual(
    buildInventoryListResponse({ items: [], total: 0, page: 3, limit: 50 }),
    {
      items: [],
      total: 0,
      page: 3,
      limit: 50,
      totalPages: 1,
    }
  );
});

test("buildInventoryListResponse computes pagination for non-empty results", () => {
  const payload = buildInventoryListResponse({ items: [{ _id: "inv-1" }], total: 101, page: 2, limit: 50 });

  assert.equal(payload.totalPages, 3);
  assert.equal(payload.total, 101);
  assert.equal(payload.page, 2);
  assert.equal(payload.limit, 50);
});

test("resolveAvailableQuantity prefers tracked availableQty when present", () => {
  assert.equal(resolveAvailableQuantity({ quantity: 5, availableQty: 1 }), 1);
  assert.equal(resolveAvailableQuantity({ quantity: 5 }), 5);
});

test("buildInventoryDashboardSummary separates low-stock and out-of-stock variants", () => {
  const productId = new mongoose.Types.ObjectId();
  const variantId = new mongoose.Types.ObjectId();
  const variantIdTwo = new mongoose.Types.ObjectId();

  const summary = buildInventoryDashboardSummary({
    threshold: 2,
    limit: 8,
    items: [
      {
        _id: "inventory-1",
        productId,
        variantId,
        stockKey: "SKU-1",
        sizeLabel: "36",
        quantity: 1,
      },
      {
        _id: "inventory-2",
        productId,
        variantId: variantIdTwo,
        stockKey: "SKU-2",
        sizeLabel: "38",
        quantity: 0,
      },
      {
        _id: "inventory-3",
        productId,
        variantId: new mongoose.Types.ObjectId(),
        stockKey: "SKU-3",
        sizeLabel: "40",
        quantity: 4,
      },
    ],
    productMap: new Map([
      [String(productId), { _id: productId, title: "Silk Saree", slug: "silk-saree" }],
    ]),
    variantMap: new Map([
      [String(variantId), { _id: variantId, colors: [{ name: "Red" }], sizeLabel: "36", stock: [{ stockKey: "SKU-1", availableQty: 1, reorderLevel: 0 }] }],
      [String(variantIdTwo), { _id: variantIdTwo, colors: [{ name: "Blue" }], sizeLabel: "38", stock: [{ stockKey: "SKU-2", availableQty: 0, reorderLevel: 0 }] }],
    ]),
  });

  assert.equal(summary.threshold, 2);
  assert.equal(summary.lowStockVariantsCount, 1);
  assert.equal(summary.outOfStockVariantsCount, 1);
  assert.equal(summary.lowStockVariants[0].productTitle, "Silk Saree");
  assert.equal(summary.lowStockVariants[0].availableStock, 1);
  assert.equal(summary.outOfStockVariants[0].availableStock, 0);
  assert.match(summary.lowStockVariants[0].variantSummary, /Red/);
});
