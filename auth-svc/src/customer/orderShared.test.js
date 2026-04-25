import test from "node:test";
import assert from "node:assert/strict";
import {
  isCustomerCancellableItem,
  isCustomerPackedCancellationRequestable,
  isCustomerReturnableItem,
  isPackedItemAdminCancelable,
  resolveOrderFulfillmentStatus,
  resolveOrderPaymentStatus,
  validateAdminItemStatusTransition,
} from "./orderShared.js";

test("customer cancellation is allowed only while processing", () => {
  assert.equal(isCustomerCancellableItem({ fulfillmentStatus: "processing" }), true);
  assert.equal(isCustomerCancellableItem({ fulfillmentStatus: "packed" }), false);
  assert.equal(isCustomerCancellableItem({ fulfillmentStatus: "shipped" }), false);
});

test("packed customer cancellation is request-only while packed", () => {
  assert.equal(isCustomerPackedCancellationRequestable({ fulfillmentStatus: "packed" }), true);
  assert.equal(isCustomerPackedCancellationRequestable({ fulfillmentStatus: "processing" }), false);
  assert.equal(isCustomerPackedCancellationRequestable({ fulfillmentStatus: "shipped" }), false);
});

test("packed item admin cancel is allowed only while packed", () => {
  assert.equal(isPackedItemAdminCancelable({ fulfillmentStatus: "packed" }), true);
  assert.equal(isPackedItemAdminCancelable({ fulfillmentStatus: "processing" }), false);
  assert.equal(isPackedItemAdminCancelable({ fulfillmentStatus: "shipped" }), false);
});

test("customer return request is allowed only after delivery", () => {
  assert.equal(isCustomerReturnableItem({ fulfillmentStatus: "delivered" }), true);
  assert.equal(isCustomerReturnableItem({ fulfillmentStatus: "shipped" }), false);
  assert.equal(isCustomerReturnableItem({ fulfillmentStatus: "return_requested" }), false);
});

test("shipping requires outbound tracking number", () => {
  assert.deepEqual(
    validateAdminItemStatusTransition({
      currentStatus: "packed",
      nextStatus: "shipped",
      outboundTrackingNumber: "",
    }),
    {
      ok: false,
      error: "Outbound tracking number is required before shipping",
    }
  );

  assert.equal(
    validateAdminItemStatusTransition({
      currentStatus: "packed",
      nextStatus: "shipped",
      outboundTrackingNumber: "AWB123",
    }).ok,
    true
  );
});

test("shipping is blocked once a packed item has a cancellation request", () => {
  assert.deepEqual(
    validateAdminItemStatusTransition({
      currentStatus: "packed",
      nextStatus: "shipped",
      outboundTrackingNumber: "AWB123",
      cancelRequestedAt: "2026-04-25T10:00:00.000Z",
    }),
    {
      ok: false,
      error: "Packed items with a cancellation request cannot be shipped",
    }
  );
});

test("collection scheduling requires collection tracking number", () => {
  assert.deepEqual(
    validateAdminItemStatusTransition({
      currentStatus: "return_requested",
      nextStatus: "collection_scheduled",
      collectionTrackingNumber: "",
    }),
    {
      ok: false,
      error: "Collection tracking number is required before scheduling collection",
    }
  );

  assert.equal(
    validateAdminItemStatusTransition({
      currentStatus: "return_requested",
      nextStatus: "collection_scheduled",
      collectionTrackingNumber: "RET-456",
    }).ok,
    true
  );
});

test("reverse logistics states win order fulfillment rollup", () => {
  const order = {
    items: [
      { fulfillmentStatus: "shipped" },
      { fulfillmentStatus: "return_requested" },
    ],
  };

  assert.equal(resolveOrderFulfillmentStatus(order), "return_requested");
});

test("all cancelled items roll up to cancelled order fulfillment", () => {
  const order = {
    items: [
      { fulfillmentStatus: "cancelled" },
      { fulfillmentStatus: "cancelled" },
    ],
  };

  assert.equal(resolveOrderFulfillmentStatus(order), "cancelled");
});

test("all admin-cancelled items roll up to cancelled by admin", () => {
  const order = {
    items: [
      { fulfillmentStatus: "cancelled_by_admin" },
      { fulfillmentStatus: "cancelled_by_admin" },
    ],
  };

  assert.equal(resolveOrderFulfillmentStatus(order), "cancelled_by_admin");
});

test("mixed outbound items roll up to packed while unpacked stays admin-only", () => {
  const order = {
    items: [
      { fulfillmentStatus: "unpacked" },
      { fulfillmentStatus: "shipped" },
    ],
  };

  assert.equal(resolveOrderFulfillmentStatus(order), "packed");
});

test("all delivered items roll up to delivered order fulfillment", () => {
  const order = {
    items: [
      { fulfillmentStatus: "delivered" },
      { fulfillmentStatus: "delivered" },
    ],
  };

  assert.equal(resolveOrderFulfillmentStatus(order), "delivered");
});

test("payment rollup reflects pending and completed refunds", () => {
  assert.equal(
    resolveOrderPaymentStatus({
      paymentStatus: "paid",
      items: [
        { fulfillmentStatus: "return_requested" },
        { fulfillmentStatus: "shipped" },
      ],
    }),
    "refund_pending"
  );

  assert.equal(
    resolveOrderPaymentStatus({
      paymentStatus: "paid",
      items: [
        { fulfillmentStatus: "cancelled" },
        { fulfillmentStatus: "shipped" },
      ],
    }),
    "partially_refunded"
  );

  assert.equal(
    resolveOrderPaymentStatus({
      paymentStatus: "paid",
      items: [
        { fulfillmentStatus: "cancelled" },
        { fulfillmentStatus: "refund_completed" },
      ],
    }),
    "refunded"
  );
});

test("payment rollup preserves payment failed orders", () => {
  assert.equal(
    resolveOrderPaymentStatus({
      paymentStatus: "payment_failed",
      items: [{ fulfillmentStatus: "processing" }],
    }),
    "payment_failed"
  );
});
