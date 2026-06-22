import test from "node:test";
import assert from "node:assert/strict";
import Permission from "./admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";
import AuditLog from "../audit/audit-log.model.js";
import {
  createPermission,
  deletePermission,
  isSuperSystemLevel,
  updatePermissions,
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
  const originalFindById = Permission.findById;
  let findCalled = false;
  Permission.findById = async () => {
    findCalled = true;
    return null;
  };

  try {
    const res = createMockRes();
    await deletePermission({ auth: { systemLevel: "ADMIN" }, params: { id: "perm-1" } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(findCalled, false);
  } finally {
    Permission.findById = originalFindById;
  }
});

test("updatePermissions blocks renaming system permissions", async () => {
  const originalFindById = Permission.findById;
  const originalRoleFind = Role.find;
  Permission.findById = async () => ({
    _id: "perm-1",
    code: "order:return",
    description: "Existing",
    isSystemPermission: true,
    toObject() {
      return { _id: this._id, code: this.code, description: this.description, isSystemPermission: this.isSystemPermission };
    },
    async save() {
      return this;
    },
  });
  Role.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });

  try {
    const res = createMockRes();
    await updatePermissions(
      {
        auth: { systemLevel: "SUPER" },
        body: { id: "perm-1", code: "renamed:code", description: "New description" },
      },
      res
    );
    assert.equal(res.statusCode, 409);
  } finally {
    Permission.findById = originalFindById;
    Role.find = originalRoleFind;
  }
});

test("updatePermissions blocks renaming a non-system permission that is assigned to roles", async () => {
  const originalFindById = Permission.findById;
  const originalFindOne = Permission.findOne;
  const originalRoleFind = Role.find;
  Permission.findById = async () => ({
    _id: "perm-2",
    code: "custom:code",
    description: "Existing",
    isSystemPermission: false,
    toObject() {
      return { _id: this._id, code: this.code, description: this.description, isSystemPermission: this.isSystemPermission };
    },
    async save() {
      return this;
    },
  });
  Permission.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
  Role.find = () => ({
    select() {
      return this;
    },
    lean: async () => [{ _id: "role-1", name: "ORDER_ADMIN", isSystemRole: false, systemLevel: "NONE" }],
  });

  try {
    const res = createMockRes();
    await updatePermissions(
      {
        auth: { systemLevel: "SUPER" },
        body: { id: "perm-2", code: "custom:renamed", description: "Updated description" },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, "Remove this permission from assigned roles before renaming it.");
  } finally {
    Permission.findById = originalFindById;
    Permission.findOne = originalFindOne;
    Role.find = originalRoleFind;
  }
});

test("updatePermissions allows non-system description updates", async () => {
  const originalFindById = Permission.findById;
  const originalFindOne = Permission.findOne;
  const originalRoleFind = Role.find;
  let saved = false;
  Permission.findById = async () => ({
    _id: "perm-3",
    code: "custom:code",
    description: "Existing",
    isSystemPermission: false,
    toObject() {
      return { _id: this._id, code: this.code, description: this.description, isSystemPermission: this.isSystemPermission };
    },
    async save() {
      saved = true;
      return this;
    },
  });
  Permission.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
  Role.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });

  try {
    const res = createMockRes();
    await updatePermissions(
      {
        auth: { systemLevel: "SUPER" },
        body: { id: "perm-3", code: "custom:code", description: "Updated description" },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(saved, true);
    assert.equal(res.body.permission.description, "Updated description");
  } finally {
    Permission.findById = originalFindById;
    Permission.findOne = originalFindOne;
    Role.find = originalRoleFind;
  }
});

test("deletePermission rejects deletion when permission is still assigned to roles", async () => {
  const originalFindById = Permission.findById;
  const originalRoleFind = Role.find;
  const originalAuditCreate = AuditLog.create;
  const auditEntries = [];
  Permission.findById = async () => ({
    _id: "perm-4",
    code: "custom:delete",
    description: "Existing",
    isSystemPermission: false,
    toObject() {
      return { _id: this._id, code: this.code, description: this.description, isSystemPermission: this.isSystemPermission };
    },
  });
  Role.find = () => ({
    select() {
      return this;
    },
    lean: async () => [{ _id: "role-2", name: "CUSTOM_ROLE", isSystemRole: false, systemLevel: "NONE" }],
  });
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    const res = createMockRes();
    await deletePermission({
      auth: { systemLevel: "SUPER" },
      user: {
        _id: "665f45f70f00000000000060",
        email: "admin@example.com",
        name: "Admin",
        primaryRole: "SUPER_ADMIN",
        roleNames: ["SUPER_ADMIN"],
      },
      params: { id: "perm-4" },
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, "Remove this permission from roles before deleting it");
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0].action, "PERMISSION_DELETE_REJECTED");
    assert.equal(auditEntries[0].result, "FAILURE");
  } finally {
    Permission.findById = originalFindById;
    Role.find = originalRoleFind;
    AuditLog.create = originalAuditCreate;
  }
});
