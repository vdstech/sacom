import test from "node:test";
import assert from "node:assert/strict";
import User from "./admin-users.model.js";
import AuditLog from "../audit/audit-log.model.js";
import { updateUser } from "./admin-users.controller.js";

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

test("updateUser audits USER_UPDATED and USER_DISABLED when a user is disabled", async () => {
  const originalFindById = User.findById;
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  const originalAuditCreate = AuditLog.create;
  const auditEntries = [];

  User.findById = () => ({
    lean: async () => ({
      _id: "665f45f70f00000000000081",
      email: "ops@example.com",
      name: "Ops User",
      roles: ["665f45f70f00000000000091"],
      disabled: false,
      force_reset: false,
    }),
  });
  User.findByIdAndUpdate = () => ({
    lean: async () => ({
      _id: "665f45f70f00000000000081",
      email: "ops@example.com",
      name: "Ops User",
      roles: ["665f45f70f00000000000091"],
      disabled: true,
      force_reset: false,
    }),
  });
  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    const res = createMockRes();
    await updateUser(
      {
        params: { id: "665f45f70f00000000000081" },
        body: { disabled: true },
        user: {
          _id: "665f45f70f00000000000001",
          email: "admin@example.com",
          name: "Admin User",
          primaryRole: "SUPER_ADMIN",
          roleNames: ["SUPER_ADMIN"],
        },
        auth: { systemLevel: "SUPER" },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(auditEntries.length, 2);
    assert.equal(auditEntries[0].action, "USER_UPDATED");
    assert.equal(auditEntries[1].action, "USER_DISABLED");
    assert.equal(auditEntries[1].changes.before.disabled, false);
    assert.equal(auditEntries[1].changes.after.disabled, true);
  } finally {
    User.findById = originalFindById;
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
    AuditLog.create = originalAuditCreate;
  }
});
