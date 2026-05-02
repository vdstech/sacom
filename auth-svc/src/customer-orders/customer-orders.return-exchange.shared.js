function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export const RETURN_EXCHANGE_KINDS = ["RETURN", "EXCHANGE"];

export const RETURN_EXCHANGE_STATUSES = [
  "RETURN_REQUESTED",
  "RETURN_UNDER_INVESTIGATION",
  "RETURN_ACCEPTED",
  "RETURN_REJECTED",
  "RETURN_IN_TRANSIT",
  "RETURN_RECEIVED",
  "RETURN_REFUND_PLACEHOLDER_PENDING",
  "EXCHANGE_REQUESTED",
  "EXCHANGE_UNDER_INVESTIGATION",
  "EXCHANGE_ACCEPTED",
  "EXCHANGE_REJECTED",
  "EXCHANGE_IN_TRANSIT",
  "EXCHANGE_RECEIVED",
  "EXCHANGE_COUPON_PLACEHOLDER_PENDING",
];

const TRANSITIONS = {
  RETURN_REQUESTED: ["RETURN_UNDER_INVESTIGATION"],
  RETURN_UNDER_INVESTIGATION: ["RETURN_ACCEPTED", "RETURN_REJECTED"],
  RETURN_ACCEPTED: ["RETURN_IN_TRANSIT"],
  RETURN_REJECTED: [],
  RETURN_IN_TRANSIT: ["RETURN_RECEIVED"],
  RETURN_RECEIVED: ["RETURN_REFUND_PLACEHOLDER_PENDING"],
  RETURN_REFUND_PLACEHOLDER_PENDING: [],
  EXCHANGE_REQUESTED: ["EXCHANGE_UNDER_INVESTIGATION"],
  EXCHANGE_UNDER_INVESTIGATION: ["EXCHANGE_ACCEPTED", "EXCHANGE_REJECTED"],
  EXCHANGE_ACCEPTED: ["EXCHANGE_IN_TRANSIT"],
  EXCHANGE_REJECTED: [],
  EXCHANGE_IN_TRANSIT: ["EXCHANGE_RECEIVED"],
  EXCHANGE_RECEIVED: ["EXCHANGE_COUPON_PLACEHOLDER_PENDING"],
  EXCHANGE_COUPON_PLACEHOLDER_PENDING: [],
};

export function isReturnExchangeKind(value) {
  return RETURN_EXCHANGE_KINDS.includes(normalizeString(value).toUpperCase());
}

export function isReturnExchangeStatus(value) {
  return RETURN_EXCHANGE_STATUSES.includes(normalizeString(value).toUpperCase());
}

export function normalizeReturnExchangeKind(value, fallback = "RETURN") {
  const normalized = normalizeString(value, fallback).toUpperCase();
  return isReturnExchangeKind(normalized) ? normalized : fallback;
}

export function normalizeReturnExchangeStatus(value, fallback = "") {
  const normalized = normalizeString(value, fallback).toUpperCase();
  return isReturnExchangeStatus(normalized) ? normalized : fallback;
}

export function getRequestedStatusForKind(kind) {
  return normalizeReturnExchangeKind(kind) === "EXCHANGE" ? "EXCHANGE_REQUESTED" : "RETURN_REQUESTED";
}

export function getInvestigationStatusForKind(kind) {
  return normalizeReturnExchangeKind(kind) === "EXCHANGE" ? "EXCHANGE_UNDER_INVESTIGATION" : "RETURN_UNDER_INVESTIGATION";
}

export function getAcceptedStatusForKind(kind) {
  return normalizeReturnExchangeKind(kind) === "EXCHANGE" ? "EXCHANGE_ACCEPTED" : "RETURN_ACCEPTED";
}

export function getRejectedStatusForKind(kind) {
  return normalizeReturnExchangeKind(kind) === "EXCHANGE" ? "EXCHANGE_REJECTED" : "RETURN_REJECTED";
}

export function getInTransitStatusForKind(kind) {
  return normalizeReturnExchangeKind(kind) === "EXCHANGE" ? "EXCHANGE_IN_TRANSIT" : "RETURN_IN_TRANSIT";
}

export function getReceivedStatusForKind(kind) {
  return normalizeReturnExchangeKind(kind) === "EXCHANGE" ? "EXCHANGE_RECEIVED" : "RETURN_RECEIVED";
}

export function getPlaceholderPendingStatusForKind(kind) {
  return normalizeReturnExchangeKind(kind) === "EXCHANGE"
    ? "EXCHANGE_COUPON_PLACEHOLDER_PENDING"
    : "RETURN_REFUND_PLACEHOLDER_PENDING";
}

export function hasFullAdminVisibility(status) {
  return [
    "RETURN_UNDER_INVESTIGATION",
    "RETURN_ACCEPTED",
    "RETURN_REJECTED",
    "RETURN_IN_TRANSIT",
    "RETURN_RECEIVED",
    "RETURN_REFUND_PLACEHOLDER_PENDING",
    "EXCHANGE_UNDER_INVESTIGATION",
    "EXCHANGE_ACCEPTED",
    "EXCHANGE_REJECTED",
    "EXCHANGE_IN_TRANSIT",
    "EXCHANGE_RECEIVED",
    "EXCHANGE_COUPON_PLACEHOLDER_PENDING",
  ].includes(normalizeReturnExchangeStatus(status));
}

export function validateReturnExchangeTransition(currentStatus, nextStatus) {
  const current = normalizeReturnExchangeStatus(currentStatus);
  const next = normalizeReturnExchangeStatus(nextStatus);
  if (!current || !next) {
    return { ok: false, error: "A valid return or exchange status is required" };
  }
  if (current === next) {
    return { ok: false, error: "Select a different return or exchange status" };
  }
  if ((TRANSITIONS[current] || []).includes(next)) return { ok: true };
  return { ok: false, error: `Cannot change return or exchange status from ${current} to ${next}` };
}

export function validateReturnExchangeTrackingUpdate({
  kind = "RETURN",
  currentStatus,
  courierName,
  returnTrackingNumber,
}) {
  const normalizedKind = normalizeReturnExchangeKind(kind);
  const current = normalizeReturnExchangeStatus(currentStatus);
  const next = getInTransitStatusForKind(normalizedKind);
  const courier = normalizeString(courierName);
  const tracking = normalizeString(returnTrackingNumber);

  if (!courier) return { ok: false, error: "Courier name is required", statusCode: 400 };
  if (!tracking) return { ok: false, error: "Return tracking number is required", statusCode: 400 };

  const transition = validateReturnExchangeTransition(current, next);
  if (!transition.ok) {
    return {
      ok: false,
      error: current === getRejectedStatusForKind(normalizedKind)
        ? "Tracking cannot be updated for rejected return or exchange"
        : `${normalizedKind === "EXCHANGE" ? "Exchange" : "Return"} must be accepted before tracking is updated`,
      statusCode: 409,
    };
  }

  return { ok: true, courierName: courier, returnTrackingNumber: tracking };
}

export function validateReturnExchangeReceipt({ kind = "RETURN", currentStatus, returnTrackingNumber }) {
  const normalizedKind = normalizeReturnExchangeKind(kind);
  const current = normalizeReturnExchangeStatus(currentStatus);
  const next = getReceivedStatusForKind(normalizedKind);
  if (!normalizeString(returnTrackingNumber)) {
    return { ok: false, error: "Return tracking number is required before receiving item", statusCode: 409 };
  }

  const transition = validateReturnExchangeTransition(current, next);
  if (!transition.ok) {
    return {
      ok: false,
      error: `${normalizedKind === "EXCHANGE" ? "Exchange" : "Return"} tracking number is required before receiving item`,
      statusCode: 409,
    };
  }

  return { ok: true };
}

export function validateReturnExchangePlaceholder({ kind = "RETURN", currentStatus }) {
  const normalizedKind = normalizeReturnExchangeKind(kind);
  const current = normalizeReturnExchangeStatus(currentStatus);
  const next = getPlaceholderPendingStatusForKind(normalizedKind);
  const transition = validateReturnExchangeTransition(current, next);
  if (!transition.ok) {
    return {
      ok: false,
      error: `${normalizedKind === "EXCHANGE" ? "Exchange" : "Return"} must be received before placeholder creation`,
      statusCode: 409,
    };
  }
  return { ok: true };
}

export function validateReturnExchangeRequest({
  kind = "RETURN",
  eligibility,
  reason,
  phoneNumber,
  whatsappNumber,
  existingCase,
}) {
  const normalizedKind = normalizeReturnExchangeKind(kind);
  const normalizedReason = normalizeString(reason);
  const phone = normalizeString(phoneNumber);
  const whatsapp = normalizeString(whatsappNumber);

  if (existingCase) {
    return { ok: false, error: "A return or exchange case already exists for this item", code: "CASE_ALREADY_EXISTS", statusCode: 409 };
  }

  if (!normalizedReason) {
    return {
      ok: false,
      error: normalizedKind === "EXCHANGE" ? "Exchange reason is required" : "Return reason is required",
      code: "REASON_REQUIRED",
      statusCode: 400,
    };
  }

  if (!phone && !whatsapp) {
    return {
      ok: false,
      error: "Phone number or WhatsApp number is required",
      code: "CONTACT_REQUIRED",
      statusCode: 400,
    };
  }

  if (!eligibility?.returnEligible) {
    if (eligibility?.reason === "not_delivered") {
      return {
        ok: false,
        error: normalizedKind === "EXCHANGE" ? "Exchange is allowed only after delivery" : "Return is allowed only after delivery",
        code: "NOT_DELIVERED",
        statusCode: 409,
      };
    }
    if (eligibility?.reason === "non_returnable") {
      return {
        ok: false,
        error: "This item is not returnable or exchangeable",
        code: "RETURN_NOT_ALLOWED",
        statusCode: 409,
      };
    }
    if (eligibility?.reason === "expired") {
      return {
        ok: false,
        error: "Return and exchange window expired",
        code: "RETURN_WINDOW_EXPIRED",
        statusCode: 409,
      };
    }
    return {
      ok: false,
      error: "This item is not eligible for return or exchange",
      code: "NOT_ELIGIBLE",
      statusCode: 409,
    };
  }

  return { ok: true, reason: normalizedReason, phoneNumber: phone, whatsappNumber: whatsapp };
}

export function shapeReturnExchangeCaseForAdmin(caseDoc) {
  const status = normalizeReturnExchangeStatus(caseDoc?.status);
  const fullVisibility = hasFullAdminVisibility(status);
  const base = {
    caseId: String(caseDoc?._id || caseDoc?.caseId || ""),
    kind: normalizeReturnExchangeKind(caseDoc?.kind, ""),
    orderItemId: normalizeString(caseDoc?.orderItemId),
    productName: normalizeString(caseDoc?.productName),
    reason: normalizeString(caseDoc?.reason),
    requestDate: caseDoc?.createdAt || caseDoc?.requestDate || null,
    status,
  };

  if (!fullVisibility) return base;

  return {
    ...base,
    phoneNumber: normalizeString(caseDoc?.phoneNumber),
    whatsappNumber: normalizeString(caseDoc?.whatsappNumber),
    courierName: normalizeString(caseDoc?.courierName),
    returnTrackingNumber: normalizeString(caseDoc?.returnTrackingNumber),
    decisionNote: normalizeString(caseDoc?.decisionNote),
    customer: caseDoc?.customer || null,
    order: caseDoc?.order || null,
    orderItem: caseDoc?.orderItem || null,
    investigationStartedAt: caseDoc?.investigationStartedAt || null,
    investigationStartedByUserId: caseDoc?.investigationStartedByUserId ? String(caseDoc.investigationStartedByUserId) : "",
    acceptedAt: caseDoc?.acceptedAt || null,
    acceptedByUserId: caseDoc?.acceptedByUserId ? String(caseDoc.acceptedByUserId) : "",
    rejectedAt: caseDoc?.rejectedAt || null,
    rejectedByUserId: caseDoc?.rejectedByUserId ? String(caseDoc.rejectedByUserId) : "",
    trackingUpdatedAt: caseDoc?.trackingUpdatedAt || null,
    trackingUpdatedByUserId: caseDoc?.trackingUpdatedByUserId ? String(caseDoc.trackingUpdatedByUserId) : "",
    receivedAt: caseDoc?.receivedAt || null,
    receivedByUserId: caseDoc?.receivedByUserId ? String(caseDoc.receivedByUserId) : "",
    placeholderCreatedAt: caseDoc?.placeholderCreatedAt || null,
    placeholderCreatedByUserId: caseDoc?.placeholderCreatedByUserId ? String(caseDoc.placeholderCreatedByUserId) : "",
    createdAt: caseDoc?.createdAt || null,
    updatedAt: caseDoc?.updatedAt || null,
  };
}

export function filterReturnExchangeCasesForQueue(cases = [], { kind = "", status = "", search = "" } = {}) {
  const normalizedKind = normalizeReturnExchangeKind(kind, "");
  const normalizedStatus = normalizeReturnExchangeStatus(status, "");
  const searchValue = normalizeString(search).toLowerCase();

  return (Array.isArray(cases) ? cases : []).filter((caseDoc) => {
    if (normalizedKind && normalizeReturnExchangeKind(caseDoc?.kind, "") !== normalizedKind) return false;
    if (normalizedStatus && normalizeReturnExchangeStatus(caseDoc?.status, "") !== normalizedStatus) return false;
    if (!searchValue) return true;
    return [
      caseDoc?.caseId,
      caseDoc?.orderItemId,
      caseDoc?.productName,
      caseDoc?.reason,
      caseDoc?.kind,
      caseDoc?.status,
    ].some((value) => normalizeString(value).toLowerCase().includes(searchValue));
  });
}
