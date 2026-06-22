import test from "node:test";
import assert from "node:assert/strict";
import AuditLog from "../audit/audit-log.model.js";
import { login } from "./admin-auth.controller.js";

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

test("login audits ADMIN_LOGIN_FAILED when credentials are missing", async () => {
  const originalAuditCreate = AuditLog.create;
  const auditEntries = [];

  AuditLog.create = async (payload) => {
    auditEntries.push(payload);
    return payload;
  };

  try {
    const res = createMockRes();
    await login(
      {
        body: { email: "admin@example.com" },
        headers: {},
        ip: "127.0.0.1",
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0].action, "ADMIN_LOGIN_FAILED");
    assert.equal(auditEntries[0].result, "FAILURE");
    assert.equal(auditEntries[0].failureReason, "MISSING_CREDENTIALS");
  } finally {
    AuditLog.create = originalAuditCreate;
  }
});
