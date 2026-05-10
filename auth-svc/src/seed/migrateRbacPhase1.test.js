import test from "node:test";
import assert from "node:assert/strict";
import Permission from "../admin-permissions/admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";
import Session from "../admin-sessions/admin-sessions.model.js";
import {
  ROLE_PERMISSION_ADDITIONS,
  buildMigratedPermissionCodes,
  upsertPhase1Permissions,
  migrateRole,
  invalidateAdminSessions,
} from "./migrateRbacPhase1.js";

test("buildMigratedPermissionCodes preserves deprecated codes while adding new ones idempotently", () => {
  const currentCodes = ["category:read", "category:write", "product:write"];
  const additions = ["category:create", "category:update", "product:update", "product:update"];

  const nextCodes = buildMigratedPermissionCodes(currentCodes, additions);

  assert.deepEqual(nextCodes, [
    "category:create",
    "category:read",
    "category:update",
    "category:write",
    "product:update",
    "product:write",
  ]);
});

test("upsertPhase1Permissions upserts the Phase 1 catalog", async () => {
  const originalUpdate = Permission.findOneAndUpdate;
  const seenCodes = [];
  Permission.findOneAndUpdate = async (query) => {
    seenCodes.push(query.code);
    return { _id: `perm:${query.code}`, code: query.code };
  };

  try {
    await upsertPhase1Permissions();
    assert.ok(seenCodes.includes("category:create"));
    assert.ok(seenCodes.includes("product:update"));
    assert.ok(seenCodes.includes("product:inventory:update"));
    assert.ok(seenCodes.includes("order:shipping"));
    assert.ok(seenCodes.includes("order:packaging"));
    assert.equal(seenCodes.includes("order:pack"), false);
  } finally {
    Permission.findOneAndUpdate = originalUpdate;
  }
});

test("migrateRole patches a role idempotently without removing deprecated codes", async () => {
  const originalFindOne = Role.findOne;
  const originalFind = Permission.find;

  const fakeRole = {
    permissions: ["perm-read", "perm-deprecated"],
    async save() {},
  };

  Role.findOne = async ({ name }) => (name === "ORDER_MANAGER" ? fakeRole : null);
  Permission.find = ({ _id: { $in } }) => ({
    select: () => ({
      lean: async () => (
        $in.includes("perm-read")
          ? [{ code: "order:read" }, { code: "order:write" }, { code: "order:ship" }]
          : []
      ),
    }),
  });

  try {
    const permissionIdMap = new Map([
      ["order:read", "perm-read"],
      ["order:write", "perm-write"],
      ["order:ship", "perm-ship"],
      ["order:admin", "perm-admin"],
      ["order:packaging", "perm-packaging"],
      ["order:shipping", "perm-shipping"],
    ]);

    await migrateRole("ORDER_MANAGER", ROLE_PERMISSION_ADDITIONS.ORDER_MANAGER, permissionIdMap);

    assert.deepEqual(fakeRole.permissions, [
      "perm-admin",
      "perm-packaging",
      "perm-read",
      "perm-ship",
      "perm-shipping",
      "perm-write",
    ]);
  } finally {
    Role.findOne = originalFindOne;
    Permission.find = originalFind;
  }
});

test("invalidateAdminSessions clears backend sessions", async () => {
  const originalDeleteMany = Session.deleteMany;
  let deleteCalled = false;
  Session.deleteMany = async () => {
    deleteCalled = true;
    return { deletedCount: 4 };
  };

  try {
    await invalidateAdminSessions();
    assert.equal(deleteCalled, true);
  } finally {
    Session.deleteMany = originalDeleteMany;
  }
});
