import test from "node:test";
import assert from "node:assert/strict";
import { validateCreateReview } from "./review.validation.js";

function runMiddleware(middleware, req) {
  let statusCode = 200;
  let payload = null;
  let nextCalled = false;
  middleware(
    req,
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
        return this;
      },
    },
    () => {
      nextCalled = true;
    }
  );
  return { statusCode, payload, nextCalled };
}

test("validateCreateReview accepts a valid review payload", () => {
  const result = runMiddleware(validateCreateReview, {
    params: { productId: "665c0b0f2f1f4d2a9e0a1f01" },
    body: {
      rating: 5,
      title: "Beautiful fabric",
      comment: "The quality and finishing were excellent throughout.",
    },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.nextCalled, true);
});

test("validateCreateReview rejects invalid rating and empty content", () => {
  const ratingResult = runMiddleware(validateCreateReview, {
    params: { productId: "665c0b0f2f1f4d2a9e0a1f01" },
    body: {
      rating: 7,
      title: "Too high",
      comment: "This should fail validation for rating.",
    },
  });
  assert.equal(ratingResult.statusCode, 400);

  const emptyResult = runMiddleware(validateCreateReview, {
    params: { productId: "665c0b0f2f1f4d2a9e0a1f01" },
    body: {
      rating: 4,
      title: "  ",
      comment: "   ",
    },
  });
  assert.equal(emptyResult.statusCode, 400);
});
