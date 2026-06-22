import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditLog from "../audit/audit-log.model.js";
import CustomerAddress from "../customer-addresses/customer-addresses.model.js";
import CustomerOrder from "./customer-orders.model.js";
import CheckoutSession from "./customer-orders.checkout-session.model.js";
import StorefrontCartRead from "./customer-orders.storefront-cart.model.js";
import StorefrontCategoryRead from "./customer-orders.storefront-category.model.js";
import StorefrontProductRead from "./customer-orders.storefront-product.model.js";
import StorefrontVariantRead from "./customer-orders.storefront-variant.model.js";
import StorefrontInventoryRead from "./customer-orders.storefront-inventory.model.js";
import InventoryLedger from "./customer-orders.inventory-ledger.model.js";
import OrderShipment from "./customer-orders.shipment.model.js";
import ReturnExchangeCase from "./customer-orders.return-exchange-case.model.js";
import ExchangeCoupon from "./customer-orders.exchange-coupon.model.js";
import NotificationPlaceholder from "./customer-orders.notification-placeholder.model.js";
import CouponReservation from "./customer-orders.coupon-reservation.model.js";
import CouponRedemption from "./customer-orders.coupon-redemption.model.js";
import IdempotencyRecord from "./customer-orders.idempotency-record.model.js";
import {
  acceptReturnExchangeCase,
  cancelCustomerOrderItemAndRestock,
  finalizePreparedCustomerOrder,
  generateExchangeCoupon,
  markOrderItemShipped,
  rejectReturnExchangeCase,
  startReturnExchangeInvestigation,
} from "./customer-orders.service.js";
import { confirmCheckoutSession } from "./customer-orders.checkout.service.js";

function createId(seed) {
  return new mongoose.Types.ObjectId(seed).toString();
}

function createInventoryDoc({ productId, variantId, stockKey, availableQty = 5, reservedQty = 0 } = {}) {
  return {
    stockKey,
    productId,
    variantId,
    quantity: availableQty,
    availableQty,
    reservedQty,
    damagedQty: 0,
    lostQty: 0,
    reorderLevel: 1,
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
  };
}

function createVariantDoc({ productId, variantId, stockKey, availableQty = 5, reservedQty = 0, taxRate = 0.05 } = {}) {
  return {
    _id: variantId,
    productId,
    price: 100,
    discount: { type: "flat", value: 20, label: "Promo" },
    taxRate,
    isActive: true,
    stock: [{
      stockKey,
      quantity: availableQty,
      availableQty,
      reservedQty,
      damagedQty: 0,
      lostQty: 0,
      reorderLevel: 1,
    }],
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
  };
}

function createMockOrderItem({ lineId = "item-1", productId, variantId, stockKey, status = "RESERVED", quantity = 1 } = {}) {
  return {
    lineId,
    productId,
    variantId,
    stockKey,
    quantity,
    title: "Test Product",
    fulfillmentStatus: status,
    physicalOwner: status === "SHIPPING_IN_PROGRESS" ? "SHIPPING_OPERATOR" : "WAREHOUSE",
    courierName: status === "SHIPPING_IN_PROGRESS" ? "BlueDart" : "",
    outboundTrackingNumber: status === "SHIPPING_IN_PROGRESS" ? "TRK-100" : "",
    lineGrandTotal: 80,
    lineTotal: 80,
    unitPrice: 80,
    lineSubtotal: 100,
    lineDiscountTotal: 20,
    taxRate: 0.05,
    priceIncludesTax: true,
    packageVerificationStatus: "VERIFIED",
    labelStatus: "PRINTED",
  };
}

test("finalizePreparedCustomerOrder emits ORDER_CREATED with pricing metadata and inventory reserve audit", async () => {
  const originals = {
    addressFindOne: CustomerAddress.findOne,
    inventoryFindOne: StorefrontInventoryRead.findOne,
    variantFindOne: StorefrontVariantRead.findOne,
    orderCreate: CustomerOrder.create,
    inventoryLedgerCreate: InventoryLedger.create,
    auditCreate: AuditLog.create,
  };
  const auditEntries = [];
  const customerId = createId("665f45f70f00000000001001");
  const addressId = createId("665f45f70f00000000001002");
  const productId = createId("665f45f70f00000000001003");
  const variantId = createId("665f45f70f00000000001004");
  const stockKey = "SKU-ORDER-1";
  const inventoryDoc = createInventoryDoc({ productId, variantId, stockKey, availableQty: 3, reservedQty: 0 });
  const variantDoc = createVariantDoc({ productId, variantId, stockKey, availableQty: 3, reservedQty: 0 });

  CustomerAddress.findOne = () => ({
    lean: async () => ({
      _id: addressId,
      customer: customerId,
      fullName: "Asha Rao",
      phone: "9999999999",
      line1: "10 MG Road",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560001",
      country: "IN",
    }),
  });
  StorefrontInventoryRead.findOne = async () => inventoryDoc;
  StorefrontVariantRead.findOne = async () => variantDoc;
  CustomerOrder.create = async (payload) => ({
    ...payload,
    _id: createId("665f45f70f00000000001005"),
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
  });
  InventoryLedger.create = async () => ({});
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    const order = await finalizePreparedCustomerOrder({
      customerId,
      addressId,
      actorId: customerId,
      actorRole: "CUSTOMER",
      clearCartOnSuccess: false,
      prepared: {
        itemCount: 1,
        items: [{
          ...createMockOrderItem({ lineId: "item-1", productId, variantId, stockKey }),
          categoryId: createId("665f45f70f00000000001006"),
          categoryLabel: "ethnic",
          imageUrl: "",
          slug: "test-product",
          currency: "INR",
          catalogDiscountType: "flat",
          catalogDiscountValue: 20,
          catalogDiscountLabel: "Promo",
          promoDiscountType: "none",
          promoDiscountValue: 0,
          promoDiscountLabel: "",
          promoDiscountAmount: 0,
          listUnitPrice: 100,
          finalUnitPrice: 80,
          lineTaxableBaseTotal: 0,
          lineTaxTotal: 0,
          lineShippingTotal: 0,
        }],
        stockOperations: [{ productId, variantId, stockKey, quantity: 1 }],
      },
    });

    assert.equal(order.grandTotal, 130);
    const reserveAudit = auditEntries.find((entry) => entry.action === "INVENTORY_RESERVED");
    const orderAudit = auditEntries.find((entry) => entry.action === "ORDER_CREATED");
    assert.ok(reserveAudit);
    assert.ok(orderAudit);
    assert.equal(reserveAudit.metadata.stockKey, stockKey);
    assert.equal(reserveAudit.metadata.orderId, order._id);
    assert.equal(reserveAudit.metadata.deltas.available, -1);
    assert.equal(reserveAudit.metadata.deltas.reserved, 1);
    assert.equal(orderAudit.metadata.pricingRuleVersion, 2);
    assert.equal(orderAudit.metadata.taxMode, "inclusive");
    assert.equal(orderAudit.metadata.includedTaxTotal, 3.81);
    assert.equal(orderAudit.metadata.shippingCharge, 50);
    assert.equal(orderAudit.metadata.payableTotal, 130);
    assert.equal(orderAudit.metadata.shippingRule.shippingTaxMode, "not_calculated_v1");
  } finally {
    CustomerAddress.findOne = originals.addressFindOne;
    StorefrontInventoryRead.findOne = originals.inventoryFindOne;
    StorefrontVariantRead.findOne = originals.variantFindOne;
    CustomerOrder.create = originals.orderCreate;
    InventoryLedger.create = originals.inventoryLedgerCreate;
    AuditLog.create = originals.auditCreate;
  }
});

test("cancelCustomerOrderItemAndRestock emits INVENTORY_RELEASED for before-picking cancellation", async () => {
  const originals = {
    orderFindOne: CustomerOrder.findOne,
    inventoryFindOne: StorefrontInventoryRead.findOne,
    variantFindOne: StorefrontVariantRead.findOne,
    inventoryLedgerCreate: InventoryLedger.create,
    auditCreate: AuditLog.create,
  };
  const auditEntries = [];
  const customerId = createId("665f45f70f00000000002001");
  const orderId = createId("665f45f70f00000000002002");
  const productId = createId("665f45f70f00000000002003");
  const variantId = createId("665f45f70f00000000002004");
  const stockKey = "SKU-CANCEL-1";
  const inventoryDoc = createInventoryDoc({ productId, variantId, stockKey, availableQty: 2, reservedQty: 1 });
  const variantDoc = createVariantDoc({ productId, variantId, stockKey, availableQty: 2, reservedQty: 1 });
  const order = {
    _id: orderId,
    customer: customerId,
    paymentStatus: "paid",
    fulfillmentStatus: "PLACED",
    status: "PLACED",
    items: [createMockOrderItem({ lineId: "item-cancel", productId, variantId, stockKey, status: "RESERVED" })],
    async save() {
      return this;
    },
    toObject() {
      return this;
    },
  };

  CustomerOrder.findOne = async () => order;
  StorefrontInventoryRead.findOne = async () => inventoryDoc;
  StorefrontVariantRead.findOne = async () => variantDoc;
  InventoryLedger.create = async () => ({});
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    await cancelCustomerOrderItemAndRestock({ customerId, orderId, itemId: "item-cancel" });
    const releaseAudit = auditEntries.find((entry) => entry.action === "INVENTORY_RELEASED");
    assert.ok(releaseAudit);
    assert.equal(releaseAudit.metadata.orderId, orderId);
    assert.equal(releaseAudit.metadata.orderItemId, "item-cancel");
    assert.equal(releaseAudit.metadata.deltas.available, 1);
    assert.equal(releaseAudit.metadata.deltas.reserved, -1);
  } finally {
    CustomerOrder.findOne = originals.orderFindOne;
    StorefrontInventoryRead.findOne = originals.inventoryFindOne;
    StorefrontVariantRead.findOne = originals.variantFindOne;
    InventoryLedger.create = originals.inventoryLedgerCreate;
    AuditLog.create = originals.auditCreate;
  }
});

test("markOrderItemShipped emits INVENTORY_SHIPPED with shipment deltas", async () => {
  const originals = {
    orderFindById: CustomerOrder.findById,
    inventoryFindOne: StorefrontInventoryRead.findOne,
    variantFindOne: StorefrontVariantRead.findOne,
    inventoryLedgerCreate: InventoryLedger.create,
    shipmentFindOneAndUpdate: OrderShipment.findOneAndUpdate,
    auditCreate: AuditLog.create,
  };
  const auditEntries = [];
  const orderId = createId("665f45f70f00000000003001");
  const productId = createId("665f45f70f00000000003002");
  const variantId = createId("665f45f70f00000000003003");
  const stockKey = "SKU-SHIP-1";
  const inventoryDoc = createInventoryDoc({ productId, variantId, stockKey, availableQty: 1, reservedQty: 1 });
  const variantDoc = createVariantDoc({ productId, variantId, stockKey, availableQty: 1, reservedQty: 1 });
  const order = {
    _id: orderId,
    paymentStatus: "paid",
    fulfillmentStatus: "SHIPPING_IN_PROGRESS",
    status: "SHIPPING_IN_PROGRESS",
    items: [createMockOrderItem({ lineId: "item-ship", productId, variantId, stockKey, status: "SHIPPING_IN_PROGRESS" })],
    async save() {
      return this;
    },
    toObject() {
      return this;
    },
  };

  CustomerOrder.findById = async () => order;
  StorefrontInventoryRead.findOne = async () => inventoryDoc;
  StorefrontVariantRead.findOne = async () => variantDoc;
  InventoryLedger.create = async () => ({});
  OrderShipment.findOneAndUpdate = async () => ({});
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    await markOrderItemShipped({
      orderId,
      itemId: "item-ship",
      actorId: createId("665f45f70f00000000003004"),
      actorRole: "SHIPPING_OPERATOR",
    });
    const shippedAudit = auditEntries.find((entry) => entry.action === "INVENTORY_SHIPPED");
    assert.ok(shippedAudit);
    assert.equal(shippedAudit.metadata.orderId, orderId);
    assert.equal(shippedAudit.metadata.orderItemId, "item-ship");
    assert.equal(shippedAudit.metadata.referenceType, "SHIPMENT");
    assert.equal(shippedAudit.metadata.deltas.reserved, -1);
  } finally {
    CustomerOrder.findById = originals.orderFindById;
    StorefrontInventoryRead.findOne = originals.inventoryFindOne;
    StorefrontVariantRead.findOne = originals.variantFindOne;
    InventoryLedger.create = originals.inventoryLedgerCreate;
    OrderShipment.findOneAndUpdate = originals.shipmentFindOneAndUpdate;
    AuditLog.create = originals.auditCreate;
  }
});

test("issue or exchange investigation actions emit standardized audit events", async () => {
  const originals = {
    caseFindById: ReturnExchangeCase.findById,
    orderFindById: CustomerOrder.findById,
    auditCreate: AuditLog.create,
  };
  const auditEntries = [];
  const orderId = createId("665f45f70f00000000004001");
  const actorId = createId("665f45f70f00000000004002");
  const caseDoc = {
    _id: createId("665f45f70f00000000004003"),
    orderId,
    orderItemId: "item-exchange",
    kind: "EXCHANGE",
    status: "EXCHANGE_REQUESTED",
    decisionNote: "",
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
  };
  const order = {
    _id: orderId,
    items: [createMockOrderItem({
      lineId: "item-exchange",
      productId: createId("665f45f70f00000000004004"),
      variantId: createId("665f45f70f00000000004005"),
      stockKey: "SKU-EX-1",
      status: "DELIVERED",
    })],
  };

  ReturnExchangeCase.findById = async () => caseDoc;
  CustomerOrder.findById = async () => order;
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    await startReturnExchangeInvestigation({ caseId: caseDoc._id, actorId });
    assert.equal(auditEntries.at(-1).action, "ISSUE_EXCHANGE_INVESTIGATION_STARTED");

    caseDoc.status = "EXCHANGE_UNDER_INVESTIGATION";
    await acceptReturnExchangeCase({ caseId: caseDoc._id, actorId, decisionNote: "Approved after review" });
    assert.equal(auditEntries.at(-1).action, "ISSUE_EXCHANGE_APPROVED");

    caseDoc.status = "EXCHANGE_UNDER_INVESTIGATION";
    await rejectReturnExchangeCase({ caseId: caseDoc._id, actorId, decisionNote: "Rejected after review" });
    assert.equal(auditEntries.at(-1).action, "ISSUE_EXCHANGE_REJECTED");
  } finally {
    ReturnExchangeCase.findById = originals.caseFindById;
    CustomerOrder.findById = originals.orderFindById;
    AuditLog.create = originals.auditCreate;
  }
});

test("generateExchangeCoupon emits CASH_COUPON_CREATED", async () => {
  const originals = {
    caseFindById: ReturnExchangeCase.findById,
    orderFindById: CustomerOrder.findById,
    couponFindOne: ExchangeCoupon.findOne,
    couponCreate: ExchangeCoupon.create,
    notificationCreate: NotificationPlaceholder.create,
    auditCreate: AuditLog.create,
  };
  const auditEntries = [];
  const orderId = createId("665f45f70f00000000005001");
  const actorId = createId("665f45f70f00000000005002");
  const caseDoc = {
    _id: createId("665f45f70f00000000005003"),
    orderId,
    orderItemId: "item-coupon",
    customerId: createId("665f45f70f00000000005004"),
    kind: "EXCHANGE",
    status: "EXCHANGE_RECEIVED",
    couponId: null,
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
  };
  const order = {
    _id: orderId,
    currency: "INR",
    items: [createMockOrderItem({
      lineId: "item-coupon",
      productId: createId("665f45f70f00000000005005"),
      variantId: createId("665f45f70f00000000005006"),
      stockKey: "SKU-COUPON-1",
      status: "DELIVERED",
    })],
  };
  order.items[0].lineGrandTotal = 500;

  ReturnExchangeCase.findById = async () => caseDoc;
  CustomerOrder.findById = async () => order;
  ExchangeCoupon.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
  ExchangeCoupon.create = async (payload) => ({
    _id: createId("665f45f70f00000000005007"),
    ...payload,
  });
  NotificationPlaceholder.create = async () => ({});
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    await generateExchangeCoupon({ caseId: caseDoc._id, actorId });
    const couponAudit = auditEntries.find((entry) => entry.action === "CASH_COUPON_CREATED");
    assert.ok(couponAudit);
    assert.equal(couponAudit.metadata.couponValue, 500);
    assert.equal(couponAudit.metadata.caseId, caseDoc._id);
  } finally {
    ReturnExchangeCase.findById = originals.caseFindById;
    CustomerOrder.findById = originals.orderFindById;
    ExchangeCoupon.findOne = originals.couponFindOne;
    ExchangeCoupon.create = originals.couponCreate;
    NotificationPlaceholder.create = originals.notificationCreate;
    AuditLog.create = originals.auditCreate;
  }
});

test("confirmCheckoutSession emits CASH_COUPON_CONSUMED during coupon-backed checkout", async () => {
  const originals = {
    idempotencyCreate: IdempotencyRecord.create,
    idempotencyUpdateOne: IdempotencyRecord.updateOne,
    sessionFindOne: CheckoutSession.findOne,
    cartFindOne: StorefrontCartRead.findOne,
    productFindOne: StorefrontProductRead.findOne,
    variantFindOne: StorefrontVariantRead.findOne,
    categoryFindById: StorefrontCategoryRead.findById,
    inventoryFindOne: StorefrontInventoryRead.findOne,
    addressFindOne: CustomerAddress.findOne,
    orderCreate: CustomerOrder.create,
    inventoryLedgerCreate: InventoryLedger.create,
    couponFindById: ExchangeCoupon.findById,
    reservationFindById: CouponReservation.findById,
    couponRedemptionCreate: CouponRedemption.create,
    auditCreate: AuditLog.create,
  };
  const auditEntries = [];
  const customerId = createId("665f45f70f00000000006001");
  const sessionId = createId("665f45f70f00000000006002");
  const orderId = createId("665f45f70f00000000006003");
  const addressId = createId("665f45f70f00000000006004");
  const productId = createId("665f45f70f00000000006005");
  const variantId = createId("665f45f70f00000000006006");
  const categoryId = createId("665f45f70f00000000006007");
  const couponId = createId("665f45f70f00000000006008");
  const reservationId = createId("665f45f70f00000000006009");
  const stockKey = "SKU-CHK-1";

  const session = {
    _id: sessionId,
    customerId,
    cartToken: "cart-token-1",
    status: "ACTIVE",
    paymentStatus: "pending",
    currency: "INR",
    couponId,
    reservationId,
    couponCode: "EXC-TEST",
    couponAppliedAmount: 0,
    payableAmount: 0,
    forfeitureAmount: 0,
    expiresAt: new Date(Date.now() + 60_000),
    async save() {
      return this;
    },
  };
  const cart = {
    cartToken: "cart-token-1",
    items: [{
      productId,
      variantId,
      stockKey,
      quantity: 1,
    }],
    async save() {
      return this;
    },
  };
  const product = { _id: productId, title: "Coupon Product", slug: "coupon-product", categoryId, isActive: true, images: [] };
  const inventoryDoc = createInventoryDoc({ productId, variantId, stockKey, availableQty: 5, reservedQty: 0 });
  const variantReadDoc = createVariantDoc({ productId, variantId, stockKey, availableQty: 5, reservedQty: 0 });
  const variantLean = { ...variantReadDoc, stock: [...variantReadDoc.stock] };
  const coupon = {
    _id: couponId,
    orderItemId: "item-1",
    code: "EXC-TEST",
    valueAmount: 25,
    currency: "INR",
    validUntil: new Date(Date.now() + 60_000),
    status: "RESERVED",
    currentReservationId: reservationId,
    reservedAt: new Date(),
    usedAt: null,
    async save() {
      return this;
    },
  };
  const reservation = {
    _id: reservationId,
    couponId,
    checkoutSessionId: sessionId,
    status: "RESERVED",
    expiresAt: session.expiresAt,
    async save() {
      return this;
    },
  };

  IdempotencyRecord.create = async () => ({ _id: createId("665f45f70f00000000006010") });
  IdempotencyRecord.updateOne = async () => ({});
  CheckoutSession.findOne = async () => session;
  StorefrontCartRead.findOne = async () => cart;
  StorefrontProductRead.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => product,
  });
  StorefrontVariantRead.findOne = (query) => {
    if (query?.isActive === true) {
      return {
        select() {
          return this;
        },
        lean: async () => variantLean,
      };
    }
    return variantReadDoc;
  };
  StorefrontCategoryRead.findById = () => ({
    select() {
      return this;
    },
    lean: async () => ({ _id: categoryId, slug: "ethnic" }),
  });
  StorefrontInventoryRead.findOne = async () => inventoryDoc;
  CustomerAddress.findOne = () => ({
    lean: async () => ({
      _id: addressId,
      customer: customerId,
      fullName: "Asha Rao",
      phone: "9999999999",
      line1: "10 MG Road",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560001",
      country: "IN",
    }),
  });
  CustomerOrder.create = async (payload) => ({
    ...payload,
    _id: orderId,
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
  });
  InventoryLedger.create = async () => ({});
  ExchangeCoupon.findById = async () => coupon;
  CouponReservation.findById = async () => reservation;
  CouponRedemption.create = async () => ({});
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    const result = await confirmCheckoutSession({
      customerId,
      sessionId,
      addressId,
      paymentStatus: "paid",
      idempotencyKey: "idem-1",
    });
    assert.equal(result.order._id, orderId);
    const consumedAudit = auditEntries.find((entry) => entry.action === "CASH_COUPON_CONSUMED");
    assert.ok(consumedAudit);
    assert.equal(consumedAudit.metadata.couponId, couponId);
    assert.equal(consumedAudit.metadata.couponCode, "EXC-TEST");
    assert.equal(consumedAudit.metadata.appliedAmount, 25);
  } finally {
    IdempotencyRecord.create = originals.idempotencyCreate;
    IdempotencyRecord.updateOne = originals.idempotencyUpdateOne;
    CheckoutSession.findOne = originals.sessionFindOne;
    StorefrontCartRead.findOne = originals.cartFindOne;
    StorefrontProductRead.findOne = originals.productFindOne;
    StorefrontVariantRead.findOne = originals.variantFindOne;
    StorefrontCategoryRead.findById = originals.categoryFindById;
    StorefrontInventoryRead.findOne = originals.inventoryFindOne;
    CustomerAddress.findOne = originals.addressFindOne;
    CustomerOrder.create = originals.orderCreate;
    InventoryLedger.create = originals.inventoryLedgerCreate;
    ExchangeCoupon.findById = originals.couponFindById;
    CouponReservation.findById = originals.reservationFindById;
    CouponRedemption.create = originals.couponRedemptionCreate;
    AuditLog.create = originals.auditCreate;
  }
});
