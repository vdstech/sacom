import crypto from "node:crypto";
import mongoose from "mongoose";
import CheckoutSession from "./customer-orders.checkout-session.model.js";
import CouponRedemption from "./customer-orders.coupon-redemption.model.js";
import CouponReservation from "./customer-orders.coupon-reservation.model.js";
import ExchangeCoupon from "./customer-orders.exchange-coupon.model.js";
import IdempotencyRecord from "./customer-orders.idempotency-record.model.js";
import AuditLog from "./customer-orders.audit-log.model.js";
import {
  finalizePreparedCustomerOrder,
  prepareCustomerOrderFromCart,
} from "./customer-orders.service.js";

const CHECKOUT_SESSION_TTL_MS = 7 * 60 * 1000;

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createHttpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildSessionExpiry(now = new Date()) {
  return new Date(now.getTime() + CHECKOUT_SESSION_TTL_MS);
}

function hashPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isExpired(value) {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

function shapeCoupon(coupon) {
  if (!coupon) return null;
  return {
    id: String(coupon._id),
    code: normalizeString(coupon.code),
    valueAmount: Math.max(0, asNumber(coupon.valueAmount, 0)),
    currency: normalizeString(coupon.currency, "INR"),
    status: normalizeString(coupon.status),
    validFrom: coupon.validFrom || null,
    validUntil: coupon.validUntil || null,
    usedAt: coupon.usedAt || null,
  };
}

function computeCouponAmounts(coupon, prepared) {
  const cartTotal = Math.max(0, asNumber(prepared?.grandTotal, 0));
  const couponValue = Math.max(0, asNumber(coupon?.valueAmount, 0));
  const appliedAmount = Math.min(cartTotal, couponValue);
  return {
    appliedAmount,
    payableAmount: Math.max(0, cartTotal - appliedAmount),
    forfeitureAmount: Math.max(0, couponValue - appliedAmount),
  };
}

function shapeCheckoutSession(session, prepared, coupon = null) {
  const subtotal = Math.max(0, asNumber(prepared?.grandTotal, 0));
  const couponAmounts = coupon ? computeCouponAmounts(coupon, prepared) : {
    appliedAmount: 0,
    payableAmount: subtotal,
    forfeitureAmount: 0,
  };
  return {
    id: String(session._id),
    cartToken: normalizeString(session.cartToken),
    status: normalizeString(session.status),
    currency: normalizeString(session.currency || prepared?.currency, "INR"),
    subtotal,
    couponAppliedAmount: couponAmounts.appliedAmount,
    payableAmount: couponAmounts.payableAmount,
    forfeitureAmount: couponAmounts.forfeitureAmount,
    expiresAt: session.expiresAt || null,
    coupon: shapeCoupon(coupon),
  };
}

function buildAuditLog({
  orderId = null,
  orderItemId = "",
  action,
  newStatus = "",
  oldStatus = "",
  metadata = {},
}) {
  return AuditLog.create({
    action,
    newStatus,
    oldStatus,
    orderId: mongoose.isValidObjectId(orderId) ? orderId : null,
    orderItemId,
    referenceId: orderItemId || String(orderId || ""),
    metadata,
  });
}

async function runIdempotentCustomerAction({
  customerId,
  routeKey,
  idempotencyKey,
  payload,
  operation,
}) {
  const normalizedKey = normalizeString(idempotencyKey);
  if (!normalizedKey) {
    throw createHttpError("Idempotency-Key header is required", 400);
  }

  const customerObjectId = mongoose.isValidObjectId(customerId) ? new mongoose.Types.ObjectId(customerId) : null;
  if (!customerObjectId) throw createHttpError("Unauthorized", 401);
  const requestHash = hashPayload(payload);
  let record = null;

  try {
    record = await IdempotencyRecord.create({
      customerId: customerObjectId,
      routeKey,
      idempotencyKey: normalizedKey,
      requestHash,
      status: "IN_PROGRESS",
      lockedAt: new Date(),
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await IdempotencyRecord.findOne({
      customerId: customerObjectId,
      routeKey,
      idempotencyKey: normalizedKey,
    }).lean();
    if (!existing) throw createHttpError("Unable to acquire idempotency key", 409);
    if (normalizeString(existing.requestHash) !== requestHash) {
      throw createHttpError("Idempotency key was already used with different request data", 409);
    }
    if (normalizeString(existing.status) === "COMPLETED") {
      return existing.responseBody;
    }
    throw createHttpError("Request is already in progress", 409);
  }

  try {
    const responseBody = await operation();
    await IdempotencyRecord.updateOne(
      { _id: record._id },
      {
        $set: {
          status: "COMPLETED",
          responseStatus: 200,
          responseBody,
          completedAt: new Date(),
        },
      }
    );
    return responseBody;
  } catch (error) {
    await IdempotencyRecord.updateOne(
      { _id: record._id },
      {
        $set: {
          status: "FAILED",
          responseStatus: error?.statusCode || 500,
          errorMessage: error?.message || "Request failed",
          completedAt: new Date(),
        },
      }
    ).catch(() => {});
    throw error;
  }
}

async function loadCheckoutSessionForCustomer(customerId, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw createHttpError("Checkout session not found", 404);
  const session = await CheckoutSession.findOne({ _id: sessionId, customerId });
  if (!session) throw createHttpError("Checkout session not found", 404);
  return session;
}

async function loadCouponByCode(code) {
  const normalizedCode = normalizeString(code).toUpperCase();
  if (!normalizedCode) throw createHttpError("Coupon code is required", 400);
  const coupon = await ExchangeCoupon.findOne({ code: normalizedCode });
  if (!coupon) throw createHttpError("Invalid coupon code", 404);
  return coupon;
}

async function releaseReservation({ session, reservation = null, coupon = null, reason = "RELEASED" }) {
  const activeReservation = reservation || (session?.reservationId
    ? await CouponReservation.findById(session.reservationId)
    : null);
  const activeCoupon = coupon || (session?.couponId ? await ExchangeCoupon.findById(session.couponId) : null);

  if (activeReservation && normalizeString(activeReservation.status) === "RESERVED") {
    activeReservation.status = reason === "EXPIRED" ? "EXPIRED" : "RELEASED";
    activeReservation.releasedAt = new Date();
    activeReservation.releaseReason = reason;
    await activeReservation.save();
  }

  if (activeCoupon && normalizeString(activeCoupon.status) === "RESERVED") {
    activeCoupon.status = "ACTIVE";
    activeCoupon.currentReservationId = null;
    activeCoupon.reservedAt = null;
    await activeCoupon.save();
  }

  if (session) {
    session.couponId = null;
    session.reservationId = null;
    session.couponCode = "";
    session.couponAppliedAmount = 0;
    session.payableAmount = 0;
    session.forfeitureAmount = 0;
    session.expiresAt = buildSessionExpiry();
    await session.save();
  }
}

async function markCouponExpired(coupon) {
  if (!coupon || normalizeString(coupon.status) !== "ACTIVE") return coupon;
  coupon.status = "EXPIRED";
  await coupon.save();
  return coupon;
}

async function validateCouponForApply({ coupon, customerId, sessionId }) {
  if (String(coupon.customerId) !== String(customerId)) {
    throw createHttpError("Coupon is not valid for this customer", 409);
  }

  if (isExpired(coupon.validUntil)) {
    await markCouponExpired(coupon);
    throw createHttpError("Coupon has expired", 409);
  }

  const status = normalizeString(coupon.status).toUpperCase();
  if (status === "USED") throw createHttpError("Coupon has already been used", 409);
  if (status === "CANCELLED") throw createHttpError("Coupon is no longer valid", 409);
  if (status === "EXPIRED") throw createHttpError("Coupon has expired", 409);

  if (status === "RESERVED") {
    const reservation = coupon.currentReservationId
      ? await CouponReservation.findById(coupon.currentReservationId)
      : await CouponReservation.findOne({ couponId: coupon._id, status: "RESERVED" });

    if (!reservation || isExpired(reservation.expiresAt)) {
      if (reservation && normalizeString(reservation.status) === "RESERVED") {
        reservation.status = "EXPIRED";
        reservation.releasedAt = new Date();
        reservation.releaseReason = "EXPIRED";
        await reservation.save();
      }
      coupon.status = "ACTIVE";
      coupon.currentReservationId = null;
      coupon.reservedAt = null;
      await coupon.save();
      return { reservation: null };
    }

    if (String(reservation.checkoutSessionId) !== String(sessionId)) {
      throw createHttpError("Coupon is already reserved for another checkout", 409);
    }
    return { reservation };
  }

  return { reservation: null };
}

async function ensureSessionPrepared(session) {
  if (normalizeString(session.status) !== "ACTIVE") {
    throw createHttpError("Checkout session is no longer active", 409);
  }
  if (isExpired(session.expiresAt)) {
    session.status = "EXPIRED";
    session.expiredAt = new Date();
    await session.save();
    await releaseReservation({ session, reason: "EXPIRED" });
    throw createHttpError("Checkout session has expired", 409);
  }

  const { cart, prepared } = await prepareCustomerOrderFromCart({ cartToken: session.cartToken });
  session.currency = "INR";
  session.subtotal = Math.max(0, asNumber(prepared.grandTotal, 0));
  session.expiresAt = buildSessionExpiry();
  await session.save();
  return { cart, prepared };
}

export async function listCustomerCoupons({ customerId }) {
  await expireActiveCoupons();
  const coupons = await ExchangeCoupon.find({ customerId }).sort({ createdAt: -1 }).lean();
  return {
    coupons: coupons.map((coupon) => ({
      id: String(coupon._id),
      code: normalizeString(coupon.code),
      valueAmount: Math.max(0, asNumber(coupon.valueAmount, 0)),
      currency: normalizeString(coupon.currency, "INR"),
      status: normalizeString(coupon.status),
      validFrom: coupon.validFrom || null,
      validUntil: coupon.validUntil || null,
      usedAt: coupon.usedAt || null,
    })),
  };
}

export async function createCheckoutSession({ customerId, cartToken }) {
  const existing = await CheckoutSession.findOne({
    customerId,
    cartToken: normalizeString(cartToken),
    status: "ACTIVE",
  }).sort({ updatedAt: -1 });

  if (existing) {
    try {
      const { prepared } = await ensureSessionPrepared(existing);
      const coupon = existing.couponId ? await ExchangeCoupon.findById(existing.couponId) : null;
      return { session: shapeCheckoutSession(existing, prepared, coupon) };
    } catch (error) {
      if ((error?.statusCode || 0) !== 409 || normalizeString(error?.message) !== "Checkout session has expired") {
        throw error;
      }
    }
  }

  const { prepared } = await prepareCustomerOrderFromCart({ cartToken });
  const session = await CheckoutSession.create({
    customerId,
    cartToken: normalizeString(cartToken),
    status: "ACTIVE",
    currency: "INR",
    subtotal: Math.max(0, asNumber(prepared.grandTotal, 0)),
    payableAmount: Math.max(0, asNumber(prepared.grandTotal, 0)),
    expiresAt: buildSessionExpiry(),
  });
  return { session: shapeCheckoutSession(session, prepared, null) };
}

export async function getCheckoutSession({ customerId, sessionId }) {
  const session = await loadCheckoutSessionForCustomer(customerId, sessionId);
  const { prepared } = await ensureSessionPrepared(session);
  const coupon = session.couponId ? await ExchangeCoupon.findById(session.couponId) : null;
  return { session: shapeCheckoutSession(session, prepared, coupon) };
}

export async function applyCheckoutCoupon({ customerId, sessionId, couponCode, idempotencyKey }) {
  return runIdempotentCustomerAction({
    customerId,
    routeKey: `checkout-coupon-apply:${sessionId}`,
    idempotencyKey,
    payload: { sessionId, couponCode: normalizeString(couponCode).toUpperCase() },
    operation: async () => {
      const session = await loadCheckoutSessionForCustomer(customerId, sessionId);
      const { prepared } = await ensureSessionPrepared(session);
      if (Math.max(0, asNumber(prepared.grandTotal, 0)) <= 0) {
        throw createHttpError("Coupon cannot be applied to an empty cart", 409);
      }

      const coupon = await loadCouponByCode(couponCode);
      const { reservation: currentCouponReservation } = await validateCouponForApply({
        coupon,
        customerId,
        sessionId: session._id,
      });

      if (session.couponId && String(session.couponId) !== String(coupon._id)) {
        await releaseReservation({ session, reason: "REMOVED" });
      }

      const couponAmounts = computeCouponAmounts(coupon, prepared);
      let reservation = currentCouponReservation;

      if (!reservation) {
        reservation = await CouponReservation.create({
          couponId: coupon._id,
          customerId,
          checkoutSessionId: session._id,
          reservedAmount: couponAmounts.appliedAmount,
          status: "RESERVED",
          expiresAt: session.expiresAt,
        });
        coupon.status = "RESERVED";
        coupon.currentReservationId = reservation._id;
        coupon.reservedAt = new Date();
        await coupon.save();
      } else {
        reservation.reservedAmount = couponAmounts.appliedAmount;
        reservation.expiresAt = session.expiresAt;
        await reservation.save();
      }

      session.couponId = coupon._id;
      session.reservationId = reservation._id;
      session.couponCode = normalizeString(coupon.code);
      session.couponAppliedAmount = couponAmounts.appliedAmount;
      session.payableAmount = couponAmounts.payableAmount;
      session.forfeitureAmount = couponAmounts.forfeitureAmount;
      await session.save();

      return { session: shapeCheckoutSession(session, prepared, coupon) };
    },
  });
}

export async function removeCheckoutCoupon({ customerId, sessionId }) {
  const session = await loadCheckoutSessionForCustomer(customerId, sessionId);
  const { prepared } = await ensureSessionPrepared(session);
  await releaseReservation({ session, reason: "REMOVED" });
  return { session: shapeCheckoutSession(session, prepared, null) };
}

export async function abandonCheckoutSession({ customerId, sessionId }) {
  const session = await loadCheckoutSessionForCustomer(customerId, sessionId);
  await releaseReservation({ session, reason: "ABANDONED" });
  session.status = "ABANDONED";
  session.abandonedAt = new Date();
  await session.save();
  return { session: { id: String(session._id), status: session.status } };
}

export async function confirmCheckoutSession({
  customerId,
  sessionId,
  addressId,
  paymentStatus = "paid",
  idempotencyKey,
}) {
  return runIdempotentCustomerAction({
    customerId,
    routeKey: `checkout-confirm:${sessionId}`,
    idempotencyKey,
    payload: { sessionId, addressId: normalizeString(addressId), paymentStatus: normalizeString(paymentStatus, "paid") },
    operation: async () => {
      const session = await loadCheckoutSessionForCustomer(customerId, sessionId);
      const { cart, prepared } = await ensureSessionPrepared(session);

      let coupon = null;
      let reservation = null;
      let couponSnapshot = null;
      const requestedPaymentStatus = normalizeString(paymentStatus, "paid").toLowerCase();

      if (session.couponId) {
        coupon = await ExchangeCoupon.findById(session.couponId);
        if (!coupon) {
          session.couponId = null;
          session.reservationId = null;
          session.couponCode = "";
          await session.save();
        } else {
          if (isExpired(coupon.validUntil)) {
            await releaseReservation({ session, coupon, reason: "EXPIRED" });
            await markCouponExpired(coupon);
            throw createHttpError("Coupon has expired", 409);
          }
          reservation = session.reservationId ? await CouponReservation.findById(session.reservationId) : null;
          if (!reservation || normalizeString(reservation.status) !== "RESERVED") {
            await releaseReservation({ session, coupon, reason: "RELEASED" });
            throw createHttpError("Coupon reservation is no longer valid", 409);
          }
          if (String(reservation.checkoutSessionId) !== String(session._id)) {
            throw createHttpError("Coupon reservation is no longer valid", 409);
          }
          const couponAmounts = computeCouponAmounts(coupon, prepared);
          couponSnapshot = {
            couponCode: coupon.code,
            appliedAmount: couponAmounts.appliedAmount,
            forfeitedAmount: couponAmounts.forfeitureAmount,
          };
          session.couponAppliedAmount = couponAmounts.appliedAmount;
          session.payableAmount = couponAmounts.payableAmount;
          session.forfeitureAmount = couponAmounts.forfeitureAmount;
          await session.save();
        }
      }

      if (requestedPaymentStatus === "payment_failed") {
        if (session.couponId || session.reservationId) {
          await releaseReservation({ session, reservation, coupon, reason: "PAYMENT_FAILED" });
        }
        throw createHttpError("Payment failed", 409);
      }

      const order = await finalizePreparedCustomerOrder({
        customerId,
        cart,
        prepared,
        addressId,
        paymentStatus: "paid",
        couponSnapshot,
      });

      if (coupon && reservation) {
        reservation.status = "CONSUMED";
        reservation.consumedAt = new Date();
        await reservation.save();

        coupon.status = "USED";
        coupon.currentReservationId = null;
        coupon.reservedAt = null;
        coupon.usedAt = new Date();
        coupon.consumedOrderId = order._id;
        await coupon.save();

        await CouponRedemption.create({
          couponId: coupon._id,
          reservationId: reservation._id,
          checkoutSessionId: session._id,
          orderId: order._id,
          customerId,
          appliedAmount: Math.max(0, asNumber(couponSnapshot?.appliedAmount, 0)),
          forfeitedAmount: Math.max(0, asNumber(couponSnapshot?.forfeitedAmount, 0)),
          currency: normalizeString(coupon.currency, "INR"),
        });

        await buildAuditLog({
          orderId: order._id,
          orderItemId: normalizeString(coupon.orderItemId),
          action: "EXCHANGE_COUPON_CONSUMED",
          newStatus: "USED",
          oldStatus: "RESERVED",
          metadata: {
            couponId: String(coupon._id),
            couponCode: normalizeString(coupon.code),
            appliedAmount: Math.max(0, asNumber(couponSnapshot?.appliedAmount, 0)),
            forfeitedAmount: Math.max(0, asNumber(couponSnapshot?.forfeitedAmount, 0)),
          },
        });
      }

      session.status = "COMPLETED";
      session.completedAt = new Date();
      await session.save();

      return {
        order,
        session: { id: String(session._id), status: session.status },
      };
    },
  });
}

export async function expireCheckoutSessionsAndReservations({ now = new Date() } = {}) {
  const sessions = await CheckoutSession.find({
    status: "ACTIVE",
    expiresAt: { $lte: now },
  });
  let expiredSessions = 0;

  for (const session of sessions) {
    await releaseReservation({ session, reason: "EXPIRED" });
    session.status = "EXPIRED";
    session.expiredAt = now;
    await session.save();
    expiredSessions += 1;
  }

  return { expiredSessions };
}

export async function expireActiveCoupons({ now = new Date() } = {}) {
  const result = await ExchangeCoupon.updateMany(
    {
      status: "ACTIVE",
      validUntil: { $lt: now },
    },
    {
      $set: { status: "EXPIRED" },
    }
  );
  return { expiredCoupons: result.modifiedCount || 0 };
}
