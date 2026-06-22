import test from "node:test";
import assert from "node:assert/strict";
import router from "./customer-orders.admin.routes.js";

function getPermissionGuard(method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} should exist`);
  return layer.route.stack[1].handle;
}

function invokeGuard(guard, permissions = [], systemLevel = "NONE") {
  let statusCode = 200;
  let nextCalled = false;
  const req = {
    auth: { systemLevel },
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

test("mark-delivered route requires ADMIN or SUPER system access", () => {
  const guard = getPermissionGuard("post", "/:id/items/:itemId/mark-delivered");

  assert.deepEqual(invokeGuard(guard, [], "ADMIN"), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, [], "SUPER"), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["order:read", "order:shipping"]), { statusCode: 403, nextCalled: false });
});

test("combined ship route requires order:read and order:shipping", () => {
  const guard = getPermissionGuard("post", "/:id/items/:itemId/ship");

  assert.deepEqual(invokeGuard(guard, ["order:read", "order:shipping"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["order:read"]), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invokeGuard(guard, ["order:shipping"]), { statusCode: 403, nextCalled: false });
});

test("fulfillment dashboard route requires order:read and fulfillment dashboard permission", () => {
  const guard = getPermissionGuard("get", "/dashboard/fulfillment");

  assert.deepEqual(
    invokeGuard(guard, ["order:read", "order:dashboard:fulfillment:read"]),
    { statusCode: 200, nextCalled: true }
  );
  assert.deepEqual(invokeGuard(guard, ["order:read"]), { statusCode: 403, nextCalled: false });
});

test("escalations dashboard route requires order:read and escalations dashboard permission", () => {
  const guard = getPermissionGuard("get", "/dashboard/escalations");

  assert.deepEqual(
    invokeGuard(guard, ["order:read", "order:dashboard:escalations:read"]),
    { statusCode: 200, nextCalled: true }
  );
  assert.deepEqual(invokeGuard(guard, ["order:read"]), { statusCode: 403, nextCalled: false });
});
