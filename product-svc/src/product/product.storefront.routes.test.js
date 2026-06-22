import test from "node:test";
import assert from "node:assert/strict";
import router from "./product.storefront.routes.js";

function getRoute(method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} should exist`);
  return layer.route;
}

test("guest review creation is blocked by customer auth", async () => {
  const route = getRoute("post", "/products/:productId/reviews");
  const customerAuthGuard = route.stack[0].handle;

  let statusCode = 200;
  let body = null;
  let nextCalled = false;

  await customerAuthGuard(
    { headers: {} },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        body = payload;
        return this;
      },
    },
    () => {
      nextCalled = true;
    }
  );

  assert.equal(statusCode, 401);
  assert.deepEqual(body, { error: "Unauthorized" });
  assert.equal(nextCalled, false);
});
