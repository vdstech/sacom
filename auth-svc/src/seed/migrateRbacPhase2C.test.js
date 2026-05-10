import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Permission from "../admin-permissions/admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";
import Session from "../admin-sessions/admin-sessions.model.js";
import {
  DEPRECATED_REPLACEMENT_MAP,
  DEPRECATED_PERMISSION_CODES,
  buildRoleCleanupPlan,
  hydrateRolesForCleanup,
  runRbacPhase2CCleanup,
  validateCleanupState,
} from "./migrateRbacPhase2C.js";

function createPermissionDocs() {
  return [
    { _id: "perm-category-read", code: "category:read" },
    { _id: "perm-category-create", code: "category:create" },
    { _id: "perm-category-update", code: "category:update" },
    { _id: "perm-product-read", code: "product:read" },
    { _id: "perm-product-create", code: "product:create" },
    { _id: "perm-product-update", code: "product:update" },
    { _id: "perm-inventory-read", code: "inventory:read" },
    { _id: "perm-product-inventory-update", code: "product:inventory:update" },
    { _id: "perm-order-read", code: "order:read" },
    { _id: "perm-order-admin", code: "order:admin" },
    { _id: "perm-order-processing", code: "order:processing" },
    { _id: "perm-order-packaging", code: "order:packaging" },
    { _id: "perm-order-shipping", code: "order:shipping" },
    { _id: "perm-order-cancellation", code: "order:cancellation" },
    { _id: "perm-order-return", code: "order:return" },
    { _id: "perm-category-write", code: "category:write" },
    { _id: "perm-product-write", code: "product:write" },
    { _id: "perm-inventory-write", code: "inventory:write" },
    { _id: "perm-order-write", code: "order:write" },
    { _id: "perm-order-delete", code: "order:delete" },
    { _id: "perm-order-pack", code: "order:pack" },
    { _id: "perm-order-ship", code: "order:ship" },
  ];
}

function createRoleDocs() {
  return [
    {
      _id: "role-admin",
      name: "ADMIN",
      permissions: [
        "perm-category-create",
        "perm-category-update",
        "perm-category-write",
        "perm-product-create",
        "perm-product-update",
        "perm-product-write",
        "perm-product-inventory-update",
        "perm-inventory-write",
        "perm-order-read",
        "perm-order-admin",
        "perm-order-write",
        "perm-order-delete",
        "perm-order-packaging",
        "perm-order-pack",
        "perm-order-shipping",
        "perm-order-ship",
      ],
    },
    {
      _id: "role-packaging",
      name: "PACKAGING_MANAGER",
      permissions: ["perm-order-read", "perm-order-packaging", "perm-order-pack"],
    },
  ];
}

function installFakeDb({ permissions, roles, sessionDeletedCount = 4 }) {
  const originals = {
    connect: mongoose.connect,
    disconnect: mongoose.disconnect,
    permissionFind: Permission.find,
    permissionDeleteMany: Permission.deleteMany,
    roleFind: Role.find,
    roleBulkWrite: Role.bulkWrite,
    roleFindOne: Role.findOne,
    sessionDeleteMany: Session.deleteMany,
  };

  let bulkWriteCalls = 0;
  let permissionDeleteCalls = 0;
  let sessionDeleteCalls = 0;

  mongoose.connect = async () => mongoose;
  mongoose.disconnect = async () => {};

  Permission.find = () => ({
    select: () => ({
      lean: async () => permissions,
    }),
  });

  Permission.deleteMany = async ({ _id: { $in } }) => {
    permissionDeleteCalls += 1;
    const ids = new Set(($in || []).map(String));
    const before = permissions.length;
    permissions.splice(0, permissions.length, ...permissions.filter((permission) => !ids.has(String(permission._id))));
    return { deletedCount: before - permissions.length };
  };

  Role.find = () => ({
    select: () => ({
      lean: async () => roles,
    }),
  });

  Role.bulkWrite = async (operations = []) => {
    bulkWriteCalls += 1;
    let modifiedCount = 0;
    for (const operation of operations) {
      const roleId = String(operation.updateOne.filter._id);
      const nextPermissions = operation.updateOne.update.$set.permissions.map(String);
      const role = roles.find((entry) => String(entry._id) === roleId);
      if (!role) continue;
      const current = (role.permissions || []).map(String);
      if (JSON.stringify(current) !== JSON.stringify(nextPermissions)) {
        role.permissions = nextPermissions;
        modifiedCount += 1;
      }
    }
    return { modifiedCount };
  };

  Role.findOne = ({ permissions: permissionQuery }) => ({
    select: () => ({
      lean: async () => {
        const targetIds = new Set((permissionQuery?.$in || []).map(String));
        return roles.find((role) => (role.permissions || []).some((permissionId) => targetIds.has(String(permissionId)))) || null;
      },
    }),
  });

  Session.deleteMany = async () => {
    sessionDeleteCalls += 1;
    return { deletedCount: sessionDeletedCount };
  };

  return {
    restore() {
      mongoose.connect = originals.connect;
      mongoose.disconnect = originals.disconnect;
      Permission.find = originals.permissionFind;
      Permission.deleteMany = originals.permissionDeleteMany;
      Role.find = originals.roleFind;
      Role.bulkWrite = originals.roleBulkWrite;
      Role.findOne = originals.roleFindOne;
      Session.deleteMany = originals.sessionDeleteMany;
    },
    getStats() {
      return {
        bulkWriteCalls,
        permissionDeleteCalls,
        sessionDeleteCalls,
      };
    },
  };
}

test("validation fails when replacement permission doc is missing", () => {
  const permissionCodeSet = new Set(Object.values(DEPRECATED_REPLACEMENT_MAP).flat().filter((code) => code !== "order:packaging"));
  const roles = [
    {
      name: "PACKAGING_MANAGER",
      permissionCodeSet: new Set(["order:read", "order:pack"]),
    },
  ];

  const result = validateCleanupState(permissionCodeSet, roles);

  assert.equal(result.isValid, false);
  assert.ok(result.missingReplacementCodes.includes("order:packaging"));
});

test("validation fails when role has deprecated code without replacement", () => {
  const permissionCodeSet = new Set(Object.values(DEPRECATED_REPLACEMENT_MAP).flat());
  const roles = [
    {
      name: "ORDER_MANAGER",
      permissionCodeSet: new Set(["order:read", "order:ship"]),
    },
  ];

  const result = validateCleanupState(permissionCodeSet, roles);

  assert.equal(result.isValid, false);
  assert.deepEqual(result.roleValidationFailures, [
    {
      roleName: "ORDER_MANAGER",
      deprecatedCode: "order:ship",
      missingReplacements: ["order:shipping"],
    },
  ]);
});

test("dry run does not mutate roles, permissions, or sessions", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const permissions = createPermissionDocs();
  const roles = createRoleDocs();
  const fakeDb = installFakeDb({ permissions, roles });

  try {
    const beforeRoles = JSON.stringify(roles);
    const beforePermissions = JSON.stringify(permissions);
    const result = await runRbacPhase2CCleanup({ dryRun: true });

    assert.equal(result.dryRun, true);
    assert.equal(JSON.stringify(roles), beforeRoles);
    assert.equal(JSON.stringify(permissions), beforePermissions);
    assert.deepEqual(fakeDb.getStats(), {
      bulkWriteCalls: 0,
      permissionDeleteCalls: 0,
      sessionDeleteCalls: 0,
    });
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});

test("normal run removes deprecated IDs from role arrays and preserves docs by default", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const permissions = createPermissionDocs();
  const roles = createRoleDocs();
  const fakeDb = installFakeDb({ permissions, roles });

  try {
    const result = await runRbacPhase2CCleanup({ dryRun: false });

    assert.equal(result.dryRun, false);
    assert.equal(result.modifiedRoles, 2);
    assert.equal(result.deprecatedPermissionDocsDeleted, 0);
    assert.equal(result.backendSessionsCleared, 4);

    const roleCodeMap = new Map(permissions.map((permission) => [String(permission._id), permission.code]));
    const hydratedRoles = hydrateRolesForCleanup(roles, roleCodeMap);
    const cleanupPlan = buildRoleCleanupPlan(
      hydratedRoles,
      new Map(DEPRECATED_PERMISSION_CODES.map((code) => [code, `deprecated:${code}`]))
    );
    assert.equal(cleanupPlan.length, 0);

    const remainingDeprecatedDocs = permissions.filter((permission) => DEPRECATED_PERMISSION_CODES.includes(permission.code));
    assert.equal(remainingDeprecatedDocs.length, DEPRECATED_PERMISSION_CODES.length);
    assert.deepEqual(fakeDb.getStats(), {
      bulkWriteCalls: 1,
      permissionDeleteCalls: 0,
      sessionDeleteCalls: 1,
    });
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});

test("deprecated permission docs are deleted only when DELETE_DEPRECATED_PERMISSION_DOCS=true", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const permissions = createPermissionDocs();
  const roles = createRoleDocs();
  const fakeDb = installFakeDb({ permissions, roles });

  try {
    const result = await runRbacPhase2CCleanup({
      dryRun: false,
      deleteDeprecatedPermissionDocs: true,
    });

    assert.equal(result.deprecatedPermissionDocsDeleted, DEPRECATED_PERMISSION_CODES.length);
    assert.equal(
      permissions.some((permission) => DEPRECATED_PERMISSION_CODES.includes(permission.code)),
      false
    );
    assert.deepEqual(fakeDb.getStats(), {
      bulkWriteCalls: 1,
      permissionDeleteCalls: 1,
      sessionDeleteCalls: 1,
    });
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});

test("failed validation leaves roles unchanged and sessions untouched", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const permissions = createPermissionDocs().filter((permission) => permission.code !== "order:shipping");
  const roles = createRoleDocs();
  const fakeDb = installFakeDb({ permissions, roles });

  try {
    const beforeRoles = JSON.stringify(roles);

    await assert.rejects(
      () => runRbacPhase2CCleanup({ dryRun: false }),
      /Phase 2C validation failed/
    );

    assert.equal(JSON.stringify(roles), beforeRoles);
    assert.deepEqual(fakeDb.getStats(), {
      bulkWriteCalls: 0,
      permissionDeleteCalls: 0,
      sessionDeleteCalls: 0,
    });
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});

test("second run is idempotent and does not clear sessions again", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const permissions = createPermissionDocs();
  const roles = createRoleDocs();
  const fakeDb = installFakeDb({ permissions, roles });

  try {
    const firstResult = await runRbacPhase2CCleanup({ dryRun: false });
    const firstStats = fakeDb.getStats();
    const secondResult = await runRbacPhase2CCleanup({ dryRun: false });
    const secondStats = fakeDb.getStats();

    assert.equal(firstResult.modifiedRoles, 2);
    assert.equal(firstResult.backendSessionsCleared, 4);
    assert.equal(secondResult.modifiedRoles, 0);
    assert.equal(secondResult.backendSessionsCleared, 0);
    assert.equal(secondStats.bulkWriteCalls, firstStats.bulkWriteCalls);
    assert.equal(secondStats.sessionDeleteCalls, firstStats.sessionDeleteCalls);
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});
