import test from "node:test";
import assert from "node:assert/strict";
import Permission from "./admin-permissions.model.js";
import {
  createPermission,
  deletePermission,
  isSuperSystemLevel,
} from "./admin-permissions.controller.js";

function createMockRes() {
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

test("isSuperSystemLevel only allows SUPER system users", () => {
  assert.equal(isSuperSystemLevel({ auth: { systemLevel: "SUPER" } }), true);
  assert.equal(isSuperSystemLevel({ auth: { systemLevel: "ADMIN" } }), false);
  assert.equal(isSuperSystemLevel({ auth: { systemLevel: "NONE" } }), false);
});

test("createPermission rejects non-super users before touching the model", async () => {
  const originalCreate = Permission.create;
  let createCalled = false;
  Permission.create = async () => {
    createCalled = true;
    return { _id: "p1" };
  };

  try {
    const res = createMockRes();
    await createPermission({ auth: { systemLevel: "ADMIN" }, body: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(createCalled, false);
  } finally {
    Permission.create = originalCreate;
  }
});

test("createPermission allows SUPER users without auto-attaching to ADMIN", async () => {
  const originalCreate = Permission.create;
  Permission.create = async (payload) => ({ _id: "perm-1", ...payload });

  try {
    const res = createMockRes();
    await createPermission(
      {
        auth: { systemLevel: "SUPER" },
        body: { code: "category:create", description: "Create categories", children: [] },
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.permission.code, "category:create");
  } finally {
    Permission.create = originalCreate;
  }
});

test("deletePermission rejects non-super users", async () => {
  const originalDelete = Permission.findByIdAndDelete;
  let deleteCalled = false;
  Permission.findByIdAndDelete = async () => {
    deleteCalled = true;
    return null;
  };

  try {
    const res = createMockRes();
    await deletePermission({ auth: { systemLevel: "ADMIN" }, params: { id: "perm-1" } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(deleteCalled, false);
  } finally {
    Permission.findByIdAndDelete = originalDelete;
  }
});
