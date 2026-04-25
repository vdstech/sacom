import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { buildInventoryListResponse, buildInventorySearchClause } from "./inventory.controller.js";

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
