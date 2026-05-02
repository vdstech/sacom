import test from "node:test";
import assert from "node:assert/strict";
import {
  filterReturnExchangeCasesForQueue,
  getAcceptedStatusForKind,
  getInTransitStatusForKind,
  getInvestigationStatusForKind,
  getPlaceholderPendingStatusForKind,
  getReceivedStatusForKind,
  getRejectedStatusForKind,
  getRequestedStatusForKind,
  hasFullAdminVisibility,
  shapeReturnExchangeCaseForAdmin,
  validateReturnExchangePlaceholder,
  validateReturnExchangeReceipt,
  validateReturnExchangeRequest,
  validateReturnExchangeTrackingUpdate,
  validateReturnExchangeTransition,
} from "./customer-orders.return-exchange.shared.js";

test("return and exchange state transitions cover the allowed lifecycle only", () => {
  assert.deepEqual(
    validateReturnExchangeTransition(getRequestedStatusForKind("RETURN"), getInvestigationStatusForKind("RETURN")),
    { ok: true }
  );
  assert.deepEqual(
    validateReturnExchangeTransition(getInvestigationStatusForKind("RETURN"), getAcceptedStatusForKind("RETURN")),
    { ok: true }
  );
  assert.deepEqual(
    validateReturnExchangeTransition(getInvestigationStatusForKind("RETURN"), getRejectedStatusForKind("RETURN")),
    { ok: true }
  );
  assert.deepEqual(
    validateReturnExchangeTransition(getAcceptedStatusForKind("RETURN"), getInTransitStatusForKind("RETURN")),
    { ok: true }
  );
  assert.deepEqual(
    validateReturnExchangeTransition(getInTransitStatusForKind("RETURN"), getReceivedStatusForKind("RETURN")),
    { ok: true }
  );
  assert.deepEqual(
    validateReturnExchangeTransition(getReceivedStatusForKind("RETURN"), getPlaceholderPendingStatusForKind("RETURN")),
    { ok: true }
  );
  assert.deepEqual(
    validateReturnExchangeTransition(getReceivedStatusForKind("EXCHANGE"), getPlaceholderPendingStatusForKind("EXCHANGE")),
    { ok: true }
  );
  assert.deepEqual(
    validateReturnExchangeTransition(getRequestedStatusForKind("EXCHANGE"), getAcceptedStatusForKind("EXCHANGE")),
    {
      ok: false,
      error: "Cannot change return or exchange status from EXCHANGE_REQUESTED to EXCHANGE_ACCEPTED",
    }
  );
});

test("request validation allows eligible return and exchange requests with at least one contact field", () => {
  const eligibility = { returnEligible: true, reason: "" };
  assert.deepEqual(
    validateReturnExchangeRequest({
      kind: "RETURN",
      eligibility,
      reason: "Wrong shade",
      phoneNumber: "9999999999",
      whatsappNumber: "",
    }),
    {
      ok: true,
      reason: "Wrong shade",
      phoneNumber: "9999999999",
      whatsappNumber: "",
    }
  );
  assert.deepEqual(
    validateReturnExchangeRequest({
      kind: "EXCHANGE",
      eligibility,
      reason: "Need a different size",
      phoneNumber: "",
      whatsappNumber: "8888888888",
    }),
    {
      ok: true,
      reason: "Need a different size",
      phoneNumber: "",
      whatsappNumber: "8888888888",
    }
  );
});

test("request validation rejects missing reason, missing contacts, ineligible items, and duplicate cases", () => {
  assert.equal(
    validateReturnExchangeRequest({
      kind: "RETURN",
      eligibility: { returnEligible: true, reason: "" },
      reason: "",
      phoneNumber: "9999999999",
      whatsappNumber: "",
    }).error,
    "Return reason is required"
  );
  assert.equal(
    validateReturnExchangeRequest({
      kind: "RETURN",
      eligibility: { returnEligible: true, reason: "" },
      reason: "Wrong item",
      phoneNumber: "",
      whatsappNumber: "",
    }).error,
    "Phone number or WhatsApp number is required"
  );
  assert.equal(
    validateReturnExchangeRequest({
      kind: "RETURN",
      eligibility: { returnEligible: false, reason: "not_delivered" },
      reason: "Wrong item",
      phoneNumber: "1",
      whatsappNumber: "",
    }).error,
    "Return is allowed only after delivery"
  );
  assert.equal(
    validateReturnExchangeRequest({
      kind: "RETURN",
      eligibility: { returnEligible: false, reason: "non_returnable" },
      reason: "Wrong item",
      phoneNumber: "1",
      whatsappNumber: "",
    }).code,
    "RETURN_NOT_ALLOWED"
  );
  assert.equal(
    validateReturnExchangeRequest({
      kind: "EXCHANGE",
      eligibility: { returnEligible: false, reason: "expired" },
      reason: "Need size change",
      phoneNumber: "",
      whatsappNumber: "2",
    }).code,
    "RETURN_WINDOW_EXPIRED"
  );
  assert.equal(
    validateReturnExchangeRequest({
      kind: "RETURN",
      eligibility: { returnEligible: true, reason: "" },
      reason: "Wrong item",
      phoneNumber: "1",
      whatsappNumber: "",
      existingCase: { _id: "abc" },
    }).code,
    "CASE_ALREADY_EXISTS"
  );
});

test("admin action validation enforces investigation, tracking, receipt, and placeholder requirements", () => {
  assert.equal(
    validateReturnExchangeTransition("RETURN_REQUESTED", "RETURN_ACCEPTED").error,
    "Cannot change return or exchange status from RETURN_REQUESTED to RETURN_ACCEPTED"
  );
  assert.equal(
    validateReturnExchangeTransition("EXCHANGE_REQUESTED", "EXCHANGE_REJECTED").error,
    "Cannot change return or exchange status from EXCHANGE_REQUESTED to EXCHANGE_REJECTED"
  );
  assert.equal(
    validateReturnExchangeTrackingUpdate({
      kind: "RETURN",
      currentStatus: "RETURN_ACCEPTED",
      courierName: "",
      returnTrackingNumber: "TRK1",
    }).error,
    "Courier name is required"
  );
  assert.equal(
    validateReturnExchangeTrackingUpdate({
      kind: "RETURN",
      currentStatus: "RETURN_ACCEPTED",
      courierName: "BlueDart",
      returnTrackingNumber: "",
    }).error,
    "Return tracking number is required"
  );
  assert.equal(
    validateReturnExchangeTrackingUpdate({
      kind: "RETURN",
      currentStatus: "RETURN_REJECTED",
      courierName: "BlueDart",
      returnTrackingNumber: "TRK1",
    }).error,
    "Tracking cannot be updated for rejected return or exchange"
  );
  assert.equal(
    validateReturnExchangeReceipt({
      kind: "RETURN",
      currentStatus: "RETURN_ACCEPTED",
      returnTrackingNumber: "",
    }).error,
    "Return tracking number is required before receiving item"
  );
  assert.equal(
    validateReturnExchangeReceipt({
      kind: "RETURN",
      currentStatus: "RETURN_ACCEPTED",
      returnTrackingNumber: "TRK1",
    }).error,
    "Return tracking number is required before receiving item"
  );
  assert.equal(
    validateReturnExchangePlaceholder({
      kind: "EXCHANGE",
      currentStatus: "EXCHANGE_ACCEPTED",
    }).error,
    "Exchange must be received before placeholder creation"
  );
});

test("admin visibility keeps requested cases redacted and reveals full detail after investigation", () => {
  const requested = shapeReturnExchangeCaseForAdmin({
    _id: "case-1",
    kind: "RETURN",
    status: "RETURN_REQUESTED",
    orderItemId: "item-1",
    productName: "Silk Saree",
    reason: "Color mismatch",
    phoneNumber: "9999999999",
    whatsappNumber: "8888888888",
    createdAt: "2026-05-01T10:00:00.000Z",
    customer: { id: "c1" },
    order: { id: "o1" },
  });

  assert.deepEqual(requested, {
    caseId: "case-1",
    kind: "RETURN",
    orderItemId: "item-1",
    productName: "Silk Saree",
    reason: "Color mismatch",
    requestDate: "2026-05-01T10:00:00.000Z",
    status: "RETURN_REQUESTED",
  });
  assert.equal(hasFullAdminVisibility("RETURN_REQUESTED"), false);

  const investigated = shapeReturnExchangeCaseForAdmin({
    _id: "case-2",
    kind: "EXCHANGE",
    status: "EXCHANGE_UNDER_INVESTIGATION",
    orderItemId: "item-2",
    productName: "Cotton Saree",
    reason: "Need different size",
    phoneNumber: "9999999999",
    whatsappNumber: "8888888888",
    courierName: "",
    returnTrackingNumber: "",
    customer: { id: "c2", name: "Asha" },
    order: { id: "o2" },
    orderItem: { id: "item-2" },
    createdAt: "2026-05-01T10:00:00.000Z",
  });

  assert.equal(investigated.phoneNumber, "9999999999");
  assert.equal(investigated.whatsappNumber, "8888888888");
  assert.deepEqual(investigated.customer, { id: "c2", name: "Asha" });
  assert.deepEqual(investigated.order, { id: "o2" });
  assert.deepEqual(investigated.orderItem, { id: "item-2" });

  const accepted = shapeReturnExchangeCaseForAdmin({
    _id: "case-3",
    kind: "RETURN",
    status: "RETURN_ACCEPTED",
    orderItemId: "item-3",
    productName: "Linen Saree",
    reason: "Defect",
    phoneNumber: "123",
    whatsappNumber: "",
    customer: { id: "c3" },
    order: { id: "o3" },
    orderItem: { id: "item-3" },
  });
  assert.equal(accepted.phoneNumber, "123");
  assert.equal(hasFullAdminVisibility("RETURN_ACCEPTED"), true);
});

test("admin visibility includes coupon generation metadata for completed exchange coupon cases", () => {
  const generated = shapeReturnExchangeCaseForAdmin({
    _id: "case-4",
    kind: "EXCHANGE",
    status: "EXCHANGE_COUPON_GENERATED",
    orderItemId: "item-4",
    productName: "Organza Saree",
    reason: "Need alternate size",
    couponGeneratedAt: "2026-05-02T10:00:00.000Z",
    coupon: { id: "coupon-1", generatedAt: "2026-05-02T10:00:00.000Z" },
  });

  assert.equal(generated.status, "EXCHANGE_COUPON_GENERATED");
  assert.equal(generated.couponGeneratedAt, "2026-05-02T10:00:00.000Z");
  assert.deepEqual(generated.coupon, { id: "coupon-1", generatedAt: "2026-05-02T10:00:00.000Z" });
});

test("queue filtering supports kind, status, search, and returned summary fields", () => {
  const cases = [
    {
      caseId: "case-1",
      kind: "RETURN",
      status: "RETURN_REQUESTED",
      orderItemId: "item-1",
      productName: "Silk Saree",
      reason: "Color mismatch",
    },
    {
      caseId: "case-2",
      kind: "EXCHANGE",
      status: "EXCHANGE_UNDER_INVESTIGATION",
      orderItemId: "item-2",
      productName: "Cotton Saree",
      reason: "Need different size",
    },
  ];

  assert.equal(filterReturnExchangeCasesForQueue(cases, { kind: "RETURN" }).length, 1);
  assert.equal(filterReturnExchangeCasesForQueue(cases, { status: "EXCHANGE_UNDER_INVESTIGATION" }).length, 1);
  assert.equal(filterReturnExchangeCasesForQueue(cases, { search: "cotton" })[0].caseId, "case-2");
});
