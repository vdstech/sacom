import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditLog from "./audit-log.model.js";
import { requestContextMiddleware } from "../../../shared/request-context.js";
import { listAuditLogs, purgeExpiredAuditLogs, recordAuditEvent } from "./audit.service.js";

test("recordAuditEvent sanitizes sensitive values and captures request context", async () => {
  const originalCreate = AuditLog.create;
  const created = [];
  AuditLog.create = async (payload) => {
    created.push(payload);
    return payload;
  };

  try {
    const req = {
      id: "req-1",
      method: "POST",
      originalUrl: "/api/admin/users",
      ip: "127.0.0.1",
      headers: { "user-agent": "node-test" },
      user: {
        _id: new mongoose.Types.ObjectId("665f45f70f00000000000011"),
        email: "admin@example.com",
        name: "Admin",
        primaryRole: "ADMIN",
        roleNames: ["ADMIN"],
      },
    };

    await new Promise((resolve, reject) => {
      requestContextMiddleware(req, {}, () => {
        recordAuditEvent({
          action: "USER_UPDATED",
          entityType: "USER",
          entityId: "665f45f70f00000000000022",
          before: { password: "secret", name: "Before" },
          after: { token: "abcd", name: "After" },
        }).then(resolve).catch(reject);
      });
    });

    assert.equal(created.length, 1);
    assert.equal(created[0].action, "USER_UPDATED");
    assert.equal(created[0].request.requestId, "req-1");
    assert.equal(created[0].request.path, "/api/admin/users");
    assert.equal(created[0].actor.email, "admin@example.com");
    assert.equal(created[0].changes.before.password, "[REDACTED]");
    assert.equal(created[0].changes.after.token, "[REDACTED]");
    assert.equal(created[0].changes.after.name, "After");
  } finally {
    AuditLog.create = originalCreate;
  }
});

test("listAuditLogs returns paginated results using filters", async () => {
  const originalCountDocuments = AuditLog.countDocuments;
  const originalFind = AuditLog.find;
  const captured = { countQuery: null, findQuery: null };

  AuditLog.countDocuments = async (query) => {
    captured.countQuery = query;
    return 2;
  };
  AuditLog.find = (query) => {
    captured.findQuery = query;
    return {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      lean: async () => ([
        {
          _id: new mongoose.Types.ObjectId("665f45f70f00000000000033"),
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          service: "auth-svc",
          action: "USER_UPDATED",
          entityType: "USER",
          entityId: "user-1",
          entityDisplayId: "user@example.com",
          actor: { actorType: "USER", email: "admin@example.com", name: "Admin", role: "ADMIN", roleNames: ["ADMIN"] },
          request: { requestId: "req-2", method: "PUT", path: "/api/admin/users/1", ipAddress: "127.0.0.1", userAgent: "node-test" },
          result: "SUCCESS",
          failureReason: "",
          changes: { before: { name: "Before" }, after: { name: "After" } },
          metadata: {},
        },
      ]),
    };
  };

  try {
    const payload = await listAuditLogs({
      page: 1,
      limit: 25,
      action: "USER_UPDATED",
      entityType: "USER",
      actor: "admin@example.com",
      result: "SUCCESS",
    });

    assert.equal(payload.total, 2);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].action, "USER_UPDATED");
    assert.equal(captured.countQuery.action, "USER_UPDATED");
    assert.equal(captured.countQuery.entityType, "USER");
    assert.equal(captured.countQuery.result, "SUCCESS");
    assert.ok(Array.isArray(captured.countQuery.$or));
    assert.deepEqual(captured.findQuery, captured.countQuery);
  } finally {
    AuditLog.countDocuments = originalCountDocuments;
    AuditLog.find = originalFind;
  }
});

test("purgeExpiredAuditLogs deletes only entries older than retention window", async () => {
  const originalDeleteMany = AuditLog.deleteMany;
  let deleteQuery = null;
  AuditLog.deleteMany = async (query) => {
    deleteQuery = query;
    return { deletedCount: 3 };
  };

  try {
    const result = await purgeExpiredAuditLogs({
      now: new Date("2026-05-31T00:00:00.000Z"),
      retentionDays: 30,
    });

    assert.equal(result.deletedCount, 3);
    assert.equal(result.retentionDays, 30);
    assert.equal(deleteQuery.createdAt.$lt.toISOString(), "2026-05-01T00:00:00.000Z");
  } finally {
    AuditLog.deleteMany = originalDeleteMany;
  }
});

test("purgeExpiredAuditLogs is disabled when retention is not configured", async () => {
  const originalDeleteMany = AuditLog.deleteMany;
  let deleteCalls = 0;
  AuditLog.deleteMany = async () => {
    deleteCalls += 1;
    return { deletedCount: 99 };
  };

  try {
    const result = await purgeExpiredAuditLogs({
      now: new Date("2026-05-31T00:00:00.000Z"),
      retentionDays: "",
    });

    assert.equal(result.enabled, false);
    assert.equal(result.retentionDays, null);
    assert.equal(result.deletedCount, 0);
    assert.equal(deleteCalls, 0);
  } finally {
    AuditLog.deleteMany = originalDeleteMany;
  }
});
