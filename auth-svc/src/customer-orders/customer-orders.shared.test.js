import test from "node:test";
import assert from "node:assert/strict";
import {
  isCustomerCancellableItem,
  isCustomerPackedCancellationRequestable,
  isCustomerShippingCancellationRequestable,
  isCustomerReturnableItem,
  isPackedItemAdminCancelable,
  normalizeItemFulfillmentStatus,
  resolveOrderFulfillmentStatus,
  resolveOrderPaymentStatus,
  validateAdminItemStatusTransition,
} from "./customer-orders.shared.js";

test("legacy fulfillment statuses normalize to the BDD state model", () => {
  assert.equal(normalizeItemFulfillmentStatus("processing"), "RESERVED");
  assert.equal(normalizeItemFulfillmentStatus("packed"), "PACKED");
  assert.equal(normalizeItemFulfillmentStatus("shipping_received"), "SHIPPING_RECEIVED");
  assert.equal(normalizeItemFulfillmentStatus("cancelled"), "CANCEL_RESTOCKED");
});

test("customer cancellation is allowed before packaging handover begins", () => {
  assert.equal(isCustomerCancellableItem({ fulfillmentStatus: "RESERVED" }), true);
  assert.equal(isCustomerCancellableItem({ fulfillmentStatus: "PICKED_FROM_WAREHOUSE" }), true);
  assert.equal(isCustomerCancellableItem({ fulfillmentStatus: "SHIPPED" }), false);
});

test("packed and shipping cancellation requests stay pre-shipment only", () => {
  assert.equal(isCustomerPackedCancellationRequestable({ fulfillmentStatus: "PACKED" }), true);
  assert.equal(isCustomerPackedCancellationRequestable({ fulfillmentStatus: "PACKAGING_IN_PROGRESS" }), false);
  assert.equal(isCustomerShippingCancellationRequestable({ fulfillmentStatus: "SHIPPING_RECEIVED" }), true);
  assert.equal(isCustomerShippingCancellationRequestable({ fulfillmentStatus: "SHIPPING_IN_PROGRESS" }), true);
  assert.equal(isCustomerShippingCancellationRequestable({ fulfillmentStatus: "SHIPPED" }), false);
});

test("admin packed cancellation stays restricted to packed items", () => {
  assert.equal(isPackedItemAdminCancelable({ fulfillmentStatus: "PACKED" }), true);
  assert.equal(isPackedItemAdminCancelable({ fulfillmentStatus: "RESERVED" }), false);
});

test("customer return eligibility helper only considers delivered items", () => {
  assert.equal(isCustomerReturnableItem({ fulfillmentStatus: "DELIVERED" }), true);
  assert.equal(isCustomerReturnableItem({ fulfillmentStatus: "SHIPPED" }), false);
});

test("packaging completion requires verification and printed label", () => {
  assert.deepEqual(
    validateAdminItemStatusTransition({
      currentStatus: "PACKAGING_IN_PROGRESS",
      nextStatus: "PACKED",
      packageVerificationStatus: "PENDING",
      labelStatus: "NOT_PRINTED",
    }),
    {
      ok: false,
      error: "Package verification is required before packing is completed",
    }
  );

  assert.equal(
    validateAdminItemStatusTransition({
      currentStatus: "PACKAGING_IN_PROGRESS",
      nextStatus: "PACKED",
      packageVerificationStatus: "VERIFIED",
      labelStatus: "PRINTED",
    }).ok,
    true
  );
});

test("shipping requires courier and tracking before mark shipped", () => {
  assert.deepEqual(
    validateAdminItemStatusTransition({
      currentStatus: "SHIPPING_IN_PROGRESS",
      nextStatus: "SHIPPED",
      courierName: "",
      outboundTrackingNumber: "",
    }),
    {
      ok: false,
      error: "Courier must be selected before tracking number is entered",
    }
  );

  assert.deepEqual(
    validateAdminItemStatusTransition({
      currentStatus: "SHIPPING_IN_PROGRESS",
      nextStatus: "SHIPPED",
      courierName: "BlueDart",
      outboundTrackingNumber: "",
    }),
    {
      ok: false,
      error: "Tracking number is required before marking item as shipped",
    }
  );
});

test("packed items with cancellation requests cannot move to shipping", () => {
  assert.deepEqual(
    validateAdminItemStatusTransition({
      currentStatus: "PACKED",
      nextStatus: "HANDED_TO_SHIPPING",
      cancelRequestedAt: "2026-04-25T10:00:00.000Z",
    }),
    {
      ok: false,
      error: "Packed items with a cancellation request cannot move to shipping",
    }
  );
});

test("order fulfillment rollup matches the BDD parent state model", () => {
  assert.equal(
    resolveOrderFulfillmentStatus({
      items: [{ fulfillmentStatus: "RESERVED" }, { fulfillmentStatus: "PICKED_FROM_WAREHOUSE" }],
    }),
    "PARTIALLY_PICKED"
  );

  assert.equal(
    resolveOrderFulfillmentStatus({
      items: [{ fulfillmentStatus: "PACKED" }, { fulfillmentStatus: "PACKAGING_IN_PROGRESS" }],
    }),
    "PARTIALLY_PACKED"
  );

  assert.equal(
    resolveOrderFulfillmentStatus({
      items: [{ fulfillmentStatus: "SHIPPED" }, { fulfillmentStatus: "CANCEL_RESTOCKED" }],
    }),
    "PARTIALLY_CANCELLED"
  );

  assert.equal(
    resolveOrderFulfillmentStatus({
      items: [{ fulfillmentStatus: "CANCEL_RESTOCKED" }, { fulfillmentStatus: "CANCEL_DAMAGED" }],
    }),
    "CANCELLED"
  );
});

test("payment rollup preserves explicit payment states without deriving refund states", () => {
  assert.equal(
    resolveOrderPaymentStatus({
      paymentStatus: "payment_failed",
      items: [{ fulfillmentStatus: "RESERVED" }],
    }),
    "payment_failed"
  );

  assert.equal(
    resolveOrderPaymentStatus({
      paymentStatus: "manual_external_resolution",
      items: [{ fulfillmentStatus: "RETURN_REQUESTED" }, { fulfillmentStatus: "SHIPPED" }],
    }),
    "manual_external_resolution"
  );
});
