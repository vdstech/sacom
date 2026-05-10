import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOrdersDashboardPayload,
  laneMatchesItem,
  resolveDashboardWindow,
} from "./customer-orders.admin.controller.js";

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

test("resolveDashboardWindow supports presets and custom ranges", () => {
  const now = new Date("2026-05-03T10:00:00.000Z");

  const preset = resolveDashboardWindow({ range: "this_year" }, now);
  assert.equal(preset.key, "this_year");
  assert.equal(preset.granularity, "month");
  assert.equal(preset.from, "2026-01-01T00:00:00.000Z");

  const custom = resolveDashboardWindow({ from: "2026-04-01", to: "2026-04-15" }, now);
  assert.equal(custom.key, "custom");
  assert.equal(custom.granularity, "day");
  assert.match(custom.label, /2026-04-01 to 2026-04-15/);
});

test("buildOrdersDashboardPayload returns KPI, trend, status, recents, and action items", () => {
  const orders = [
    {
      _id: "order-a",
      placedAt: "2026-05-02T08:00:00.000Z",
      paymentStatus: "paid",
      grandTotal: 5000,
      currency: "INR",
      addressSnapshot: { fullName: "Asha Rao" },
      items: [
        {
          productId: "product-1",
          title: "Silk Saree",
          quantity: 2,
          fulfillmentStatus: "RESERVED",
          lineGrandTotal: 5000,
        },
      ],
    },
    {
      _id: "order-b",
      placedAt: "2026-05-01T11:00:00.000Z",
      paymentStatus: "payment_failed",
      grandTotal: 1200,
      currency: "INR",
      addressSnapshot: { fullName: "Mira Das" },
      items: [
        {
          productId: "product-2",
          title: "Cotton Dupatta",
          quantity: 1,
          fulfillmentStatus: "HANDED_TO_CANCELLATION",
          lineGrandTotal: 1200,
        },
      ],
    },
    {
      _id: "order-c",
      placedAt: "2026-04-20T10:00:00.000Z",
      paymentStatus: "paid",
      grandTotal: 2400,
      currency: "INR",
      addressSnapshot: { fullName: "Ira Sen" },
      items: [
        {
          productId: "product-3",
          title: "Printed Kurta",
          quantity: 1,
          fulfillmentStatus: "SHIPPED",
          lineGrandTotal: 2400,
        },
      ],
    },
    {
      _id: "order-d",
      placedAt: "2026-05-03T10:00:00.000Z",
      paymentStatus: "paid",
      grandTotal: 3200,
      currency: "INR",
      addressSnapshot: { fullName: "Sara Ali" },
      items: [
        {
          productId: "product-4",
          title: "Linen Dress",
          quantity: 1,
          fulfillmentStatus: "SHIPPED",
          lineGrandTotal: 1600,
        },
        {
          productId: "product-5",
          title: "Linen Dress",
          quantity: 1,
          fulfillmentStatus: "PACKAGING_RECEIVED",
          lineGrandTotal: 1600,
        },
      ],
    },
    {
      _id: "order-e",
      placedAt: "2026-05-03T12:00:00.000Z",
      paymentStatus: "paid",
      grandTotal: 1800,
      currency: "INR",
      addressSnapshot: { fullName: "Nina Roy" },
      items: [
        {
          productId: "product-6",
          title: "Printed Kurta",
          quantity: 1,
          fulfillmentStatus: "PACKAGING_RECEIVED",
          lineGrandTotal: 900,
        },
        {
          productId: "product-7",
          title: "Printed Kurta",
          quantity: 1,
          fulfillmentStatus: "PACKED",
          lineGrandTotal: 900,
        },
      ],
    },
  ];

  const payload = buildOrdersDashboardPayload(orders, {
    now: new Date("2026-05-03T10:00:00.000Z"),
    query: { range: "30d" },
  });

  assert.equal(payload.kpis.revenue, 12400);
  assert.equal(payload.kpis.orders, 5);
  assert.equal(payload.kpis.averageOrderValue, 3100);
  assert.equal(payload.kpis.pendingOrders, 4);
  assert.equal(payload.summary.processing, 1);
  assert.equal(payload.summary.cancellations, 1);
  assert.equal(payload.summary.shipped, 1);
  assert.equal(payload.partiallyShipped.supported, true);
  assert.equal(payload.partiallyShipped.count, 1);
  assert.equal(payload.ordersByStatus.some((item) => item.key === "PARTIALLY_PACKED"), false);
  assert.equal(payload.salesTrend.points.length >= 2, true);
  assert.equal(payload.weeklySalesTrend.length >= 1, true);
  assert.equal(payload.currentYearMonthlyTrend.length >= 1, true);
  assert.equal(payload.comparisons.weekly.current.orders >= 1, true);
  assert.deepEqual(payload.recentOrders.map((order) => order.id), ["order-a", "order-b", "order-c", "order-d", "order-e"]);
  assert.equal(payload.topSellingProducts[0]?.label, "Silk Saree");
  assert.deepEqual(
    payload.actionRequired.map((item) => item.key),
    ["processing", "packaging", "shipping", "cancellations"]
  );
});
