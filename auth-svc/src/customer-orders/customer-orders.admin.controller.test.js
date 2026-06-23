import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOrdersDashboardExtras,
  buildOrdersDashboardPayload,
  compareLaneOrders,
  filterFulfillmentDashboardItems,
  laneCompletedMatchesItem,
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

test("handed-to-shipping items leave the packaging lane and remain in the shipping lane", () => {
  const item = {
    fulfillmentStatus: "HANDED_TO_SHIPPING",
    physicalOwner: "PACKAGING_MANAGER",
    handedToShippingAt: "2026-05-01T12:00:00.000Z",
  };

  assert.equal(laneMatchesItem("packaging", item), false);
  assert.equal(laneMatchesItem("shipping", item), true);
  assert.equal(laneCompletedMatchesItem("packaging", item), true);
});

test("completed lane history matches items already processed by that lane", () => {
  assert.equal(
    laneCompletedMatchesItem("processing", {
      fulfillmentStatus: "PACKAGING_RECEIVED",
      pickedAt: "2026-05-01T10:00:00.000Z",
      handedToPackagingAt: "2026-05-01T11:00:00.000Z",
    }),
    true
  );
  assert.equal(
    laneCompletedMatchesItem("processing", {
      fulfillmentStatus: "PICKED_FROM_WAREHOUSE",
      pickedAt: "2026-05-01T10:00:00.000Z",
    }),
    false
  );
  assert.equal(
    laneCompletedMatchesItem("shipping", {
      fulfillmentStatus: "SHIPPED",
      shippedAt: "2026-05-01T14:00:00.000Z",
    }),
    true
  );
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

test("before-picking cancellations remain visible in the cancellation lane history", () => {
  const item = {
    fulfillmentStatus: "CANCELLED_BEFORE_PICKING",
    cancelledAt: "2026-05-01T10:00:00.000Z",
  };

  assert.equal(laneMatchesItem("cancellations", item), true);
  assert.equal(laneCompletedMatchesItem("cancellations", item), true);
});

test("lane ordering keeps active work oldest-first and cancellation history newest-first", () => {
  const activeOlder = {
    placedAt: "2026-05-01T08:00:00.000Z",
    items: [{ fulfillmentStatus: "RESERVED", laneAssignedAt: "2026-05-01T08:00:00.000Z" }],
  };
  const activeNewer = {
    placedAt: "2026-05-01T09:00:00.000Z",
    items: [{ fulfillmentStatus: "RESERVED", laneAssignedAt: "2026-05-01T09:00:00.000Z" }],
  };
  const cancelledOlder = {
    placedAt: "2026-05-01T08:00:00.000Z",
    items: [{ fulfillmentStatus: "CANCELLED_BEFORE_PICKING", cancelledAt: "2026-05-01T10:00:00.000Z" }],
  };
  const cancelledNewer = {
    placedAt: "2026-05-01T08:00:00.000Z",
    items: [{ fulfillmentStatus: "CANCELLED_BEFORE_PICKING", cancelledAt: "2026-05-01T11:00:00.000Z" }],
  };

  assert.equal(compareLaneOrders(activeOlder, activeNewer, "processing") < 0, true);
  assert.equal(compareLaneOrders(cancelledNewer, cancelledOlder, "cancellations") < 0, true);
  assert.equal(compareLaneOrders(activeOlder, cancelledNewer, "cancellations") < 0, true);
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
    extras: {
      pendingIssueInvestigations: 3,
      issueCases: 2,
      exchangeCases: 4,
      couponsIssued: 5,
      couponsIssuedValue: 1500,
      couponsConsumed: 2,
      couponsConsumedValue: 550,
      failedCheckouts: 6,
      abandonedCheckouts: 7,
    },
  });

  assert.equal(payload.kpis.revenue, 12400);
  assert.equal(payload.kpis.orders, 5);
  assert.equal(payload.kpis.averageOrderValue, 3100);
  assert.equal(payload.kpis.pendingOrders, 4);
  assert.equal(payload.kpis.pendingProcessing, 1);
  assert.equal(payload.kpis.pendingPackaging, 2);
  assert.equal(payload.kpis.pendingShipping, 0);
  assert.equal(payload.kpis.pendingIssueInvestigations, 3);
  assert.equal(payload.kpis.couponsIssuedValue, 1500);
  assert.equal(payload.kpis.couponsConsumedValue, 550);
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
    ["processing", "packaging", "shipping", "cancellations", "issue_cases", "failed_checkouts", "abandoned_checkouts"]
  );
});

test("buildOrdersDashboardPayload uses payable totals for revenue and average order value", () => {
  const orders = [
    {
      _id: "order-a",
      placedAt: "2026-05-02T08:00:00.000Z",
      paymentStatus: "paid",
      total: 900,
      grandTotal: 1050,
      taxTotal: 50,
      shippingTotal: 100,
      items: [],
    },
  ];

  const payload = buildOrdersDashboardPayload(orders, {
    now: new Date("2026-05-03T10:00:00.000Z"),
    query: { range: "30d" },
  });

  assert.equal(payload.kpis.revenue, 1050);
  assert.equal(payload.kpis.averageOrderValue, 1050);
});

test("buildOrdersDashboardExtras counts checkout sessions and coupon values without relying on refunds", () => {
  const withinWindow = (value) => String(value || "").startsWith("2026-05");
  const extras = buildOrdersDashboardExtras({
    withinWindow,
    cases: [
      { createdAt: "2026-05-01T10:00:00.000Z", kind: "RETURN", status: "RETURN_REQUESTED" },
      { createdAt: "2026-05-02T10:00:00.000Z", kind: "EXCHANGE", status: "EXCHANGE_UNDER_INVESTIGATION" },
      { createdAt: "2026-04-20T10:00:00.000Z", kind: "RETURN", status: "RETURN_REQUESTED" },
    ],
    coupons: [
      { createdAt: "2026-05-03T10:00:00.000Z", valueAmount: 400 },
      { createdAt: "2026-05-04T10:00:00.000Z", valueAmount: 250, usedAt: "2026-05-06T10:00:00.000Z" },
      { createdAt: "2026-04-04T10:00:00.000Z", valueAmount: 900, usedAt: "2026-05-07T10:00:00.000Z" },
    ],
    checkoutSessions: [
      { status: "PAYMENT_FAILED", failedAt: "2026-05-05T10:00:00.000Z" },
      { status: "ABANDONED", abandonedAt: "2026-05-05T11:00:00.000Z" },
      { status: "PAYMENT_FAILED", failedAt: "2026-04-05T11:00:00.000Z" },
    ],
  });

  assert.equal(extras.issueCases, 1);
  assert.equal(extras.exchangeCases, 1);
  assert.equal(extras.pendingIssueInvestigations, 2);
  assert.equal(extras.couponsIssued, 2);
  assert.equal(extras.couponsIssuedValue, 650);
  assert.equal(extras.couponsConsumed, 2);
  assert.equal(extras.couponsConsumedValue, 1150);
  assert.equal(extras.failedCheckouts, 1);
  assert.equal(extras.abandonedCheckouts, 1);
});

test("fulfillment dashboard excludes violated items and keeps delayed non-escalated items", () => {
  const items = [
    {
      orderId: "order-1",
      itemId: "item-1",
      currentStage: "Processing",
      slaStatus: "DELAYED",
      activeEscalation: null,
      customerOrderedDate: "2026-05-01T00:00:00.000Z",
    },
    {
      orderId: "order-2",
      itemId: "item-2",
      currentStage: "Shipping",
      slaStatus: "VIOLATED",
      activeEscalation: { status: "OPEN" },
      customerOrderedDate: "2026-04-30T00:00:00.000Z",
    },
  ];

  const filtered = filterFulfillmentDashboardItems(items, { escalationsOnly: false });
  assert.deepEqual(filtered.map((item) => item.itemId), ["item-1"]);
});

test("escalations dashboard returns only violated or open-escalation items ordered by oldest customer order date", () => {
  const items = [
    {
      orderId: "order-1",
      itemId: "item-1",
      currentStage: "Packaging",
      slaStatus: "VIOLATED",
      activeEscalation: { status: "OPEN" },
      customerOrderedDate: "2026-05-02T00:00:00.000Z",
    },
    {
      orderId: "order-2",
      itemId: "item-2",
      currentStage: "Processing",
      slaStatus: "ON_TRACK",
      activeEscalation: null,
      customerOrderedDate: "2026-05-01T00:00:00.000Z",
    },
    {
      orderId: "order-3",
      itemId: "item-3",
      currentStage: "Shipping",
      slaStatus: "VIOLATED",
      activeEscalation: { status: "OPEN" },
      customerOrderedDate: "2026-04-28T00:00:00.000Z",
    },
  ];

  const filtered = filterFulfillmentDashboardItems(items, { escalationsOnly: true, bucket: "violated" });
  assert.deepEqual(filtered.map((item) => item.itemId), ["item-3", "item-1"]);
});
