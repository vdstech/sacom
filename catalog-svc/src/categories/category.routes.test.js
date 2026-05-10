import test from "node:test";
import assert from "node:assert/strict";
import router from "./category.routes.js";

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

test("category create route requires category:create", () => {
  const guard = getPermissionGuard("post", "/");

  assert.deepEqual(invokeGuard(guard, ["category:create"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["category:update"]), { statusCode: 403, nextCalled: false });
});

test("category update route requires category:update", () => {
  const guard = getPermissionGuard("put", "/:id");

  assert.deepEqual(invokeGuard(guard, ["category:update"]), { statusCode: 200, nextCalled: true });
  assert.deepEqual(invokeGuard(guard, ["category:create"]), { statusCode: 403, nextCalled: false });
});
