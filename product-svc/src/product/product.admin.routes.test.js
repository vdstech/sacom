import test from "node:test";
import assert from "node:assert/strict";
import router from "./product.admin.routes.js";

function getPermissionGuard(method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} should exist`);
  return layer.route.stack[1].handle;
}

function invokeGuard(guard, permissions = []) {
  let statusCode = 200;
  let nextCalled = false;
  const req = {
    auth: { systemLevel: "NONE" },
    effectivePermissions: new Set(permissions),
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  guard(req, res, () => {
    nextCalled = true;
  });

  return { statusCode, nextCalled };
}

test("product create route requires product:create", () => {
  const guard = getPermissionGuard("post", "/");

  assert.deepEqual(invokeGuard(guard, ["product:create"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["product:update"]), { statusCode: 403, nextCalled: false });
});

test("product update route requires product:update", () => {
  const guard = getPermissionGuard("put", "/:id");

  assert.deepEqual(invokeGuard(guard, ["product:update"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["product:create"]), { statusCode: 403, nextCalled: false });
});

test("inventory update route requires product:inventory:update", () => {
  const guard = getPermissionGuard("patch", "/inventory/:id");

  assert.deepEqual(invokeGuard(guard, ["product:inventory:update"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["inventory:read"]), { statusCode: 403, nextCalled: false });
});

test("inventory dashboard summary route requires inventory:read", () => {
  const guard = getPermissionGuard("get", "/inventory/dashboard-summary");

  assert.deepEqual(invokeGuard(guard, ["inventory:read"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["product:inventory:update"]), { statusCode: 403, nextCalled: false });
});

test("inventory risk list routes require inventory:read", () => {
  for (const path of ["/inventory/low-stock", "/inventory/out-of-stock"]) {
    const guard = getPermissionGuard("get", path);
    assert.deepEqual(invokeGuard(guard, ["inventory:read"]), { statusCode: 200, nextCalled: true });
    assert.deepEqual(invokeGuard(guard, ["product:inventory:update"]), { statusCode: 403, nextCalled: false });
  }
});

test("variant write routes require product:update", () => {
  const createGuard = getPermissionGuard("post", "/:id/variants");
  const updateGuard = getPermissionGuard("patch", "/:id/variants/:variantId");

  assert.deepEqual(invokeGuard(createGuard, ["product:update"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(updateGuard, ["product:update"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(createGuard, ["product:create"]), { statusCode: 403, nextCalled: false });
});

test("review moderation routes require review permissions", () => {
  const listGuard = getPermissionGuard("get", "/reviews");
  const approveGuard = getPermissionGuard("post", "/reviews/:reviewId/approve");

  assert.deepEqual(invokeGuard(listGuard, ["review:read"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(listGuard, ["review:moderate"]), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invokeGuard(approveGuard, ["review:moderate"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(approveGuard, ["review:read"]), { statusCode: 403, nextCalled: false });
});
