import test from "node:test";
import assert from "node:assert/strict";
import CustomerOrder from "./customer-orders.model.js";
import AuditLog from "./customer-orders.audit-log.model.js";
import {
  buildOrderOperationSummary,
  buildOrderOperationItem,
  filterOrderOperationItems,
  orderOperationTabMatchesItem,
  paginateOrderOperationItems,
} from "./customer-orders.operations.js";
import { markOrderItemDelivered } from "./customer-orders.service.js";

test("operations tab rules follow the admin dashboard eligibility", () => {
  assert.equal(orderOperationTabMatchesItem("processing", { fulfillmentStatus: "RESERVED" }), true);
  assert.equal(orderOperationTabMatchesItem("processing", { fulfillmentStatus: "PICKED_FROM_WAREHOUSE" }), true);
  assert.equal(orderOperationTabMatchesItem("processing", { fulfillmentStatus: "HANDED_TO_PACKAGING" }), false);
  assert.equal(
    orderOperationTabMatchesItem("processing", {
      fulfillmentStatus: "CANCEL_REQUESTED",
      physicalOwner: "PROCESSING_MANAGER",
    }),
    true
  );

  assert.equal(orderOperationTabMatchesItem("shipping", { fulfillmentStatus: "HANDED_TO_SHIPPING" }), true);
  assert.equal(orderOperationTabMatchesItem("shipping", { fulfillmentStatus: "SHIPPING_RECEIVED" }), true);
  assert.equal(orderOperationTabMatchesItem("shipping", { fulfillmentStatus: "SHIPPING_IN_PROGRESS" }), true);
  assert.equal(
    orderOperationTabMatchesItem("shipping", {
      fulfillmentStatus: "CANCEL_REQUESTED",
      pendingHandover: { type: "PACKAGING_TO_SHIPPING", status: "PENDING_RECEIPT" },
    }),
    true
  );
  assert.equal(
    orderOperationTabMatchesItem("shipping", {
      fulfillmentStatus: "CANCEL_REQUESTED",
      physicalOwner: "SHIPPING_OPERATOR",
    }),
    true
  );
  assert.equal(orderOperationTabMatchesItem("shipped", { fulfillmentStatus: "SHIPPED" }), true);
  assert.equal(orderOperationTabMatchesItem("shipped", { fulfillmentStatus: "DELIVERED" }), false);
  assert.equal(orderOperationTabMatchesItem("delivered", { fulfillmentStatus: "DELIVERED" }), true);
});

test("operations filtering supports summary, search, sort, and pagination", () => {
  const order = {
    _id: "665f45f70f00000000000011",
    placedAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
    addressSnapshot: {
      fullName: "Anita Rao",
      phone: "9999999999",
      line1: "10 MG Road",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560001",
      country: "IN",
    },
    items: [
      {
        lineId: "item-processing",
        title: "Temple Necklace",
        stockKey: "SKU-P1",
        fulfillmentStatus: "RESERVED",
        quantity: 1,
        unitPrice: 2100,
      },
      {
        lineId: "item-shipping",
        title: "Silk Saree",
        stockKey: "SKU-S1",
        fulfillmentStatus: "HANDED_TO_SHIPPING",
        quantity: 1,
        unitPrice: 5200,
        courierName: "BlueDart",
      },
      {
        lineId: "item-shipped",
        title: "Gold Bangles",
        stockKey: "SKU-H1",
        fulfillmentStatus: "SHIPPED",
        quantity: 2,
        lineGrandTotal: 16000,
        outboundTrackingNumber: "TRK-444",
        courierName: "Delhivery",
        shippedAt: "2026-05-01T11:30:00.000Z",
      },
    ],
  };

  const items = order.items.map((item, index) => buildOrderOperationItem(order, item, index));
  assert.deepEqual(buildOrderOperationSummary(items), {
    processing: 1,
    shipping: 1,
    shipped: 1,
    delivered: 0,
  });

  const shippedSearch = filterOrderOperationItems(items, {
    tab: "shipped",
    search: "trk-444",
    sort: "newest",
  });
  assert.equal(shippedSearch.length, 1);
  assert.equal(shippedSearch[0].orderItemId, "item-shipped");
  assert.equal(shippedSearch[0].productPrice, 8000);

  const shippingNewest = filterOrderOperationItems(
    [
      ...items,
      {
        ...items[1],
        orderItemId: "item-shipping-2",
        productName: "Kundan Set",
        productPrice: 9100,
        createdAt: "2026-05-02T10:00:00.000Z",
      },
    ],
    { tab: "shipping", sort: "price_desc" }
  );
  assert.deepEqual(
    shippingNewest.map((item) => item.orderItemId),
    ["item-shipping-2", "item-shipping"]
  );

  const paged = filterOrderOperationItems(
    [
      { ...items[0], orderItemId: "processing-1" },
      { ...items[0], orderItemId: "processing-2", createdAt: "2026-05-02T09:00:00.000Z" },
      { ...items[0], orderItemId: "processing-3", createdAt: "2026-05-03T09:00:00.000Z" },
    ],
    { tab: "processing", sort: "newest" }
  );
  assert.deepEqual(
    paged.slice(0, 2).map((item) => item.orderItemId),
    ["processing-3", "processing-2"]
  );

  const pagination = paginateOrderOperationItems(paged, { page: 2, limit: 1 });
  assert.equal(pagination.total, 3);
  assert.equal(pagination.totalPages, 3);
  assert.deepEqual(pagination.items.map((item) => item.orderItemId), ["processing-2"]);
});

test("mark delivered updates shipped items and writes a single audit log", async () => {
  const originalFindById = CustomerOrder.findById;
  const originalAuditCreate = AuditLog.create;
  const auditEntries = [];
  const order = {
    _id: "665f45f70f00000000000021",
    paymentStatus: "paid",
    fulfillmentStatus: "SHIPPED",
    status: "SHIPPED",
    items: [{
      lineId: "item-1",
      fulfillmentStatus: "SHIPPED",
      quantity: 1,
      title: "Silk Saree",
      outboundTrackingNumber: "TRK-200",
      courierName: "BlueDart",
    }],
    async save() {
      return this;
    },
    toObject() {
      return this;
    },
  };

  CustomerOrder.findById = async () => order;
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    const result = await markOrderItemDelivered({
      orderId: "665f45f70f00000000000021",
      itemId: "item-1",
      actorId: "665f45f70f00000000000099",
      actorRole: "ADMIN",
    });

    assert.equal(result.items[0].fulfillmentStatus, "DELIVERED");
    assert.ok(result.items[0].deliveredAt instanceof Date);
    assert.equal(String(result.items[0].deliveredBy), "665f45f70f00000000000099");
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0].action, "MARK_DELIVERED");
  } finally {
    CustomerOrder.findById = originalFindById;
    AuditLog.create = originalAuditCreate;
  }
});

test("mark delivered rejects non-shipped items without mutating timestamps or audit log", async () => {
  const originalFindById = CustomerOrder.findById;
  const originalAuditCreate = AuditLog.create;
  const originalDeliveredAt = new Date("2026-05-01T12:00:00.000Z");
  let auditCalls = 0;
  const order = {
    _id: "665f45f70f00000000000031",
    paymentStatus: "paid",
    fulfillmentStatus: "SHIPPED",
    status: "SHIPPED",
    items: [{
      lineId: "item-2",
      fulfillmentStatus: "DELIVERED",
      deliveredAt: originalDeliveredAt,
      deliveredBy: "665f45f70f00000000000111",
      quantity: 1,
      title: "Temple Necklace",
    }],
    async save() {
      throw new Error("save should not be called");
    },
    toObject() {
      return this;
    },
  };

  CustomerOrder.findById = async () => order;
  AuditLog.create = async () => {
    auditCalls += 1;
    return null;
  };

  try {
    await assert.rejects(async () => {
      await markOrderItemDelivered({
        orderId: "665f45f70f00000000000031",
        itemId: "item-2",
        actorId: "665f45f70f00000000000099",
        actorRole: "ADMIN",
      });
    }, (error) => {
      assert.equal(error.message, "Only shipped items can be marked as delivered");
      return true;
    });
    assert.equal(order.items[0].deliveredAt, originalDeliveredAt);
    assert.equal(auditCalls, 0);
  } finally {
    CustomerOrder.findById = originalFindById;
    AuditLog.create = originalAuditCreate;
  }
});
