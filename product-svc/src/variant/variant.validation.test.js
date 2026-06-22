import test from "node:test";
import assert from "node:assert/strict";
import { validateCreate, validateUpdate } from "./variant.validation.js";

function runMiddleware(middleware, req) {
  let statusCode = 200;
  let payload = null;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  middleware(req, res, () => {
    nextCalled = true;
  });

  return { statusCode, payload, nextCalled };
}

test("validateCreate accepts decimal taxRate values for variants", () => {
  const result = runMiddleware(validateCreate, {
    params: { id: "507f191e810c19729de860ea" },
    body: {
      price: 100,
      taxRate: 0.05,
      images: [{ url: "https://img.example/item.jpg" }],
      stock: [{ stockKey: "STK-1", quantity: 1 }],
    },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.nextCalled, true);
});

test("validateUpdate rejects invalid taxRate values", () => {
  const result = runMiddleware(validateUpdate, {
    params: { variantId: "507f191e810c19729de860eb" },
    body: {
      taxRate: 5,
    },
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.payload?.error, "taxRate must be a number greater than or equal to 0 and less than 1");
  assert.equal(result.nextCalled, false);
});
