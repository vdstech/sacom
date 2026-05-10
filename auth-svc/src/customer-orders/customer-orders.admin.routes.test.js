import test from "node:test";
import assert from "node:assert/strict";
import router from "./customer-orders.admin.routes.js";

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

test("mark-delivered route requires order:read and order:shipping", () => {
  const guard = getPermissionGuard("post", "/:id/items/:itemId/mark-delivered");

  assert.deepEqual(invokeGuard(guard, ["order:read", "order:shipping"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["order:read"]), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invokeGuard(guard, ["order:shipping"]), { statusCode: 403, nextCalled: false });
});
