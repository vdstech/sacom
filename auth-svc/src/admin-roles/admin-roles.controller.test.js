import test from "node:test";
import assert from "node:assert/strict";
import Role from "./admin-roles.model.js";
import Permission from "../admin-permissions/admin-permissions.model.js";
import AuditLog from "../audit/audit-log.model.js";
import { createRole, updateRole } from "./admin-roles.controller.js";

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

test("createRole rejects dangling permission references", async () => {
  const originalRoleFindOne = Role.findOne;
  const originalRoleCreate = Role.create;
  const originalPermissionFind = Permission.find;

  Role.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
  Role.create = async () => {
    throw new Error("Role.create should not be reached");
  };
  Permission.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });

  try {
    const res = createMockRes();
    await createRole(
      {
        auth: { systemLevel: "SUPER" },
        body: { name: "CUSTOM_MANAGER", permissions: ["665f45f70f00000000000099"] },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(String(res.body.error || ""), /invalid permission/);
  } finally {
    Role.findOne = originalRoleFindOne;
    Role.create = originalRoleCreate;
    Permission.find = originalPermissionFind;
  }
});

test("updateRole rejects dangling permission references", async () => {
  const originalRoleFindById = Role.findById;
  const originalPermissionFind = Permission.find;
  const originalAuditCreate = AuditLog.create;
  const auditEntries = [];

  Role.findById = async () => ({
    _id: "role-1",
    name: "CUSTOM_MANAGER",
    permissions: [],
    description: "",
    visibleMenus: [],
    visibleMenusConfigured: false,
    isSystemRole: false,
    async save() {
      return this;
    },
    toObject() {
      return this;
    },
  });
  Permission.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    const res = createMockRes();
    await updateRole(
      {
        auth: { systemLevel: "SUPER" },
        user: {
          _id: "665f45f70f00000000000050",
          email: "admin@example.com",
          name: "Admin",
          primaryRole: "SUPER_ADMIN",
          roleNames: ["SUPER_ADMIN"],
        },
        params: { id: "role-1" },
        body: { permissions: ["665f45f70f00000000000098"] },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(String(res.body.error || ""), /invalid permission/);
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0].action, "ROLE_UPDATE_REJECTED");
    assert.equal(auditEntries[0].result, "FAILURE");
  } finally {
    Role.findById = originalRoleFindById;
    Permission.find = originalPermissionFind;
    AuditLog.create = originalAuditCreate;
  }
});
