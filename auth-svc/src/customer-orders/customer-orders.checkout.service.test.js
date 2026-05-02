import test from "node:test";
import assert from "node:assert/strict";
import CheckoutSession from "./customer-orders.checkout-session.model.js";
import CouponReservation from "./customer-orders.coupon-reservation.model.js";
import ExchangeCoupon from "./customer-orders.exchange-coupon.model.js";
import {
  expireActiveCoupons,
  expireCheckoutSessionsAndReservations,
} from "./customer-orders.checkout.service.js";

test("expireActiveCoupons marks old active coupons as expired", async () => {
  const originalUpdateMany = ExchangeCoupon.updateMany;
  let capturedQuery = null;
  let capturedUpdate = null;

  ExchangeCoupon.updateMany = async (query, update) => {
    capturedQuery = query;
    capturedUpdate = update;
    return { modifiedCount: 2 };
  };

  try {
    const now = new Date("2026-05-03T00:00:00.000Z");
    const result = await expireActiveCoupons({ now });
    assert.equal(result.expiredCoupons, 2);
    assert.equal(capturedQuery.status, "ACTIVE");
    assert.deepEqual(capturedUpdate, { $set: { status: "EXPIRED" } });
  } finally {
    ExchangeCoupon.updateMany = originalUpdateMany;
  }
});

test("expireCheckoutSessionsAndReservations releases active coupon reservations", async () => {
  const originalFindSessions = CheckoutSession.find;
  const originalFindReservation = CouponReservation.findById;
  const originalFindCoupon = ExchangeCoupon.findById;

  const session = {
    _id: "session-1",
    status: "ACTIVE",
    couponId: "coupon-1",
    reservationId: "reservation-1",
    couponCode: "EXC-AAAA",
    cartToken: "cart-1",
    expiresAt: new Date("2026-05-02T00:00:00.000Z"),
    async save() {
      return this;
    },
  };
  const reservation = {
    _id: "reservation-1",
    status: "RESERVED",
    async save() {
      return this;
    },
  };
  const coupon = {
    _id: "coupon-1",
    status: "RESERVED",
    currentReservationId: "reservation-1",
    async save() {
      return this;
    },
  };

  CheckoutSession.find = async () => [session];
  CouponReservation.findById = async () => reservation;
  ExchangeCoupon.findById = async () => coupon;

  try {
    const result = await expireCheckoutSessionsAndReservations({ now: new Date("2026-05-03T00:00:00.000Z") });
    assert.equal(result.expiredSessions, 1);
    assert.equal(session.status, "EXPIRED");
    assert.equal(reservation.status, "EXPIRED");
    assert.equal(coupon.status, "ACTIVE");
    assert.equal(session.couponCode, "");
  } finally {
    CheckoutSession.find = originalFindSessions;
    CouponReservation.findById = originalFindReservation;
    ExchangeCoupon.findById = originalFindCoupon;
  }
});
