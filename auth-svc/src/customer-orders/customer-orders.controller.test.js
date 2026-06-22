import test from "node:test";
import assert from "node:assert/strict";
import CustomerOrder from "./customer-orders.model.js";
import StorefrontProductRead from "./customer-orders.storefront-product.model.js";
import ReturnExchangeCase from "./customer-orders.return-exchange-case.model.js";
import {
  createOrder,
  getOrder,
  listOrders,
} from "./customer-orders.controller.js";

function createResponseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("createOrder blocks direct storefront order creation", async () => {
  const res = createResponseRecorder();
  await createOrder({}, res);
  assert.equal(res.statusCode, 410);
  assert.match(String(res.body?.error || ""), /Direct order creation is no longer supported/i);
});

test("listOrders excludes legacy payment_failed orders from customer order history", async () => {
  const originalFindOrders = CustomerOrder.find;
  const originalFindProducts = StorefrontProductRead.find;
  const originalFindCases = ReturnExchangeCase.find;

  CustomerOrder.find = () => ({
    sort() {
      return {
        lean: async () => ([
          {
            _id: "paid-order",
            customer: "customer-1",
            paymentStatus: "paid",
            status: "PLACED",
            fulfillmentStatus: "PLACED",
            subtotal: 100,
            grandTotal: 100,
            total: 100,
            itemCount: 1,
            items: [{ lineId: "line-1", productId: "product-1", title: "Paid item", quantity: 1 }],
          },
          {
            _id: "failed-order",
            customer: "customer-1",
            paymentStatus: "payment_failed",
            status: "PLACED",
            fulfillmentStatus: "PLACED",
            subtotal: 50,
            grandTotal: 50,
            total: 50,
            itemCount: 1,
            items: [{ lineId: "line-2", productId: "product-2", title: "Failed item", quantity: 1 }],
          },
        ]),
      };
    },
  });
  StorefrontProductRead.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });
  ReturnExchangeCase.find = () => ({
    lean: async () => [],
  });

  try {
    const res = createResponseRecorder();
    await listOrders({ customerAuth: { customerId: "customer-1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(Array.isArray(res.body?.orders), true);
    assert.equal(res.body.orders.length, 1);
    assert.equal(res.body.orders[0]?.id, "paid-order");
  } finally {
    CustomerOrder.find = originalFindOrders;
    StorefrontProductRead.find = originalFindProducts;
    ReturnExchangeCase.find = originalFindCases;
  }
});

test("getOrder hides legacy payment_failed orders from customer detail", async () => {
  const originalFindOne = CustomerOrder.findOne;

  CustomerOrder.findOne = () => ({
    lean: async () => ({
      _id: "failed-order",
      customer: "customer-1",
      paymentStatus: "payment_failed",
      status: "PLACED",
      fulfillmentStatus: "PLACED",
      subtotal: 50,
      grandTotal: 50,
      total: 50,
      itemCount: 1,
      items: [{ lineId: "line-2", productId: "product-2", title: "Failed item", quantity: 1 }],
    }),
  });

  try {
    const res = createResponseRecorder();
    await getOrder({ params: { id: "failed-order" }, customerAuth: { customerId: "customer-1" } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body?.error, "Order not found");
  } finally {
    CustomerOrder.findOne = originalFindOne;
  }
});
