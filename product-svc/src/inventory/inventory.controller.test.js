import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Inventory from "./inventory.model.js";
import AuditLog from "../audit/audit-log.model.js";
import Variant from "../variant/variant.model.js";
import {
  buildInventoryDashboardSummary,
  buildInventoryListResponse,
  buildInventorySearchClause,
  resolveAvailableQuantity,
  updateInventory,
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

test("buildInventoryDashboardSummary uses canonical inventory quantities instead of stale variant projection", () => {
  const productId = new mongoose.Types.ObjectId();
  const variantId = new mongoose.Types.ObjectId();

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
        quantity: 0,
        availableQty: 0,
        reorderLevel: 1,
      },
    ],
    productMap: new Map([
      [String(productId), { _id: productId, title: "Silk Saree", slug: "silk-saree" }],
    ]),
    variantMap: new Map([
      [String(variantId), { _id: variantId, colors: [{ name: "Red" }], sizeLabel: "36", stock: [{ stockKey: "SKU-1", availableQty: 4, reorderLevel: 10 }] }],
    ]),
  });

  assert.equal(summary.lowStockVariantsCount, 0);
  assert.equal(summary.outOfStockVariantsCount, 1);
  assert.equal(summary.outOfStockVariants[0].availableStock, 0);
  assert.equal(summary.outOfStockVariants[0].reorderLevel, 1);
});

test("updateInventory writes an audit record for quantity changes", async () => {
  const originalFindById = Inventory.findById;
  const originalFindByIdAndUpdate = Inventory.findByIdAndUpdate;
  const originalVariantFindById = Variant.findById;
  const originalAuditCreate = AuditLog.create;
  const auditEntries = [];
  const inventoryId = new mongoose.Types.ObjectId("665f45f70f00000000000088");

  Inventory.findById = () => ({
    lean: async () => ({
      _id: inventoryId,
      stockKey: "SKU-1",
      quantity: 2,
      availableQty: 2,
      reorderLevel: 1,
      productId: new mongoose.Types.ObjectId("665f45f70f00000000000089"),
      variantId: new mongoose.Types.ObjectId("665f45f70f00000000000090"),
    }),
  });
  Inventory.findByIdAndUpdate = async () => ({
    _id: inventoryId,
    stockKey: "SKU-1",
    quantity: 5,
    availableQty: 5,
    reorderLevel: 2,
    productId: new mongoose.Types.ObjectId("665f45f70f00000000000089"),
    variantId: new mongoose.Types.ObjectId("665f45f70f00000000000090"),
    toObject() { return this; },
  });
  Variant.findById = async () => ({
    stock: [{ stockKey: "SKU-1", quantity: 1, availableQty: 1, reorderLevel: 1 }],
    async save() {
      return this;
    },
  });
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  const req = {
    params: { id: String(inventoryId) },
    body: { quantity: 5, reorderLevel: 2 },
    user: {
      _id: new mongoose.Types.ObjectId("665f45f70f00000000000091"),
      email: "inventory@example.com",
      name: "Inventory Manager",
      primaryRole: "INVENTORY_MANAGER",
      roleNames: ["INVENTORY_MANAGER"],
    },
    method: "PATCH",
    originalUrl: `/api/admin/products/inventory/${String(inventoryId)}`,
    ip: "127.0.0.1",
    headers: { "user-agent": "node-test" },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  try {
    await updateInventory(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(auditEntries.length, 2);
    assert.equal(auditEntries[0].action, "INVENTORY_RECONCILIATION_MISMATCH");
    assert.equal(auditEntries[1].action, "INVENTORY_UPDATED");
    assert.equal(auditEntries[1].changes.before.quantity, 2);
    assert.equal(auditEntries[1].changes.after.quantity, 5);
    assert.equal(auditEntries[1].metadata.deltas.quantity, 3);
  } finally {
    Inventory.findById = originalFindById;
    Inventory.findByIdAndUpdate = originalFindByIdAndUpdate;
    Variant.findById = originalVariantFindById;
    AuditLog.create = originalAuditCreate;
  }
});
