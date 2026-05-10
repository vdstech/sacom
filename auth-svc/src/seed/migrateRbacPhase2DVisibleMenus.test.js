import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Role from "../admin-roles/admin-roles.model.js";
import Session from "../admin-sessions/admin-sessions.model.js";
import {
  OPERATIONAL_ROLE_MENU_TARGETS,
  applyVisibleMenuCleanup,
  buildVisibleMenuCleanupPlan,
  runRbacPhase2DVisibleMenuCleanup,
} from "./migrateRbacPhase2DVisibleMenus.js";

function createRoles() {
  return [
    { _id: "role-super", name: "SUPER_ADMIN", visibleMenus: [], visibleMenusConfigured: false },
    { _id: "role-admin", name: "ADMIN", visibleMenus: [], visibleMenusConfigured: false },
    { _id: "role-store", name: "STOREMANAGER", visibleMenus: [], visibleMenusConfigured: false },
    { _id: "role-order-manager", name: "ORDER_MANAGER", visibleMenus: ["ordersDashboard", "processingManager"], visibleMenusConfigured: true },
    { _id: "role-order-ops", name: "ORDER_OPERATIONS", visibleMenus: [], visibleMenusConfigured: false },
    { _id: "role-packaging", name: "PACKAGING_MANAGER", visibleMenus: [], visibleMenusConfigured: false },
    { _id: "role-shipping", name: "SHIPPING_MANAGER", visibleMenus: [], visibleMenusConfigured: false },
    { _id: "role-return", name: "RETURN_MANAGER", visibleMenus: [], visibleMenusConfigured: false },
    { _id: "role-inventory", name: "INVENTORY_MANAGER", visibleMenus: [], visibleMenusConfigured: false },
  ];
}

function installFakeDb(roles, sessionDeletedCount = 5) {
  const originals = {
    connect: mongoose.connect,
    disconnect: mongoose.disconnect,
    roleFind: Role.find,
    roleBulkWrite: Role.bulkWrite,
    sessionDeleteMany: Session.deleteMany,
  };

  let bulkWriteCalls = 0;
  let sessionDeleteCalls = 0;

  mongoose.connect = async () => mongoose;
  mongoose.disconnect = async () => {};

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
      const nextVisibleMenus = operation.updateOne.update.$set.visibleMenus;
      const nextConfigured = operation.updateOne.update.$set.visibleMenusConfigured;
      const role = roles.find((entry) => String(entry._id) === roleId);
      if (!role) continue;
      const currentMenus = JSON.stringify(role.visibleMenus || []);
      const nextMenus = JSON.stringify(nextVisibleMenus || []);
      const currentConfigured = !!role.visibleMenusConfigured;
      if (currentMenus !== nextMenus || currentConfigured !== nextConfigured) {
        role.visibleMenus = nextVisibleMenus;
        role.visibleMenusConfigured = nextConfigured;
        modifiedCount += 1;
      }
    }
    return { modifiedCount };
  };

  Session.deleteMany = async () => {
    sessionDeleteCalls += 1;
    return { deletedCount: sessionDeletedCount };
  };

  return {
    restore() {
      mongoose.connect = originals.connect;
      mongoose.disconnect = originals.disconnect;
      Role.find = originals.roleFind;
      Role.bulkWrite = originals.roleBulkWrite;
      Session.deleteMany = originals.sessionDeleteMany;
    },
    getStats() {
      return { bulkWriteCalls, sessionDeleteCalls };
    },
  };
}

test("buildVisibleMenuCleanupPlan targets only operational roles and leaves admin roles out of mutation", () => {
  const plan = buildVisibleMenuCleanupPlan(createRoles());

  assert.equal(plan.length, Object.keys(OPERATIONAL_ROLE_MENU_TARGETS).length);
  assert.equal(plan.some((entry) => entry.roleName === "SUPER_ADMIN"), false);
  assert.equal(plan.some((entry) => entry.roleName === "ADMIN"), false);

  const packaging = plan.find((entry) => entry.roleName === "PACKAGING_MANAGER");
  assert.deepEqual(packaging.targetVisibleMenus, ["packagingManager"]);
  assert.equal(packaging.targetVisibleMenusConfigured, true);
  assert.equal(packaging.changed, true);
});

test("dry run does not mutate roles or clear sessions", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const roles = createRoles();
  const fakeDb = installFakeDb(roles);

  try {
    const before = JSON.stringify(roles);
    const result = await runRbacPhase2DVisibleMenuCleanup({ dryRun: true });

    assert.equal(result.dryRun, true);
    assert.equal(JSON.stringify(roles), before);
    assert.deepEqual(fakeDb.getStats(), {
      bulkWriteCalls: 0,
      sessionDeleteCalls: 0,
    });
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});

test("normal run updates operational roles to target menus", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const roles = createRoles();
  const fakeDb = installFakeDb(roles);

  try {
    const result = await runRbacPhase2DVisibleMenuCleanup({ dryRun: false });

    assert.equal(result.modifiedRoles, Object.keys(OPERATIONAL_ROLE_MENU_TARGETS).length);
    assert.equal(result.backendSessionsCleared, 5);

    const orderOperations = roles.find((role) => role.name === "ORDER_OPERATIONS");
    assert.deepEqual(orderOperations.visibleMenus, OPERATIONAL_ROLE_MENU_TARGETS.ORDER_OPERATIONS);
    assert.equal(orderOperations.visibleMenusConfigured, true);

    const inventoryManager = roles.find((role) => role.name === "INVENTORY_MANAGER");
    assert.deepEqual(inventoryManager.visibleMenus, ["inventory"]);
    assert.equal(inventoryManager.visibleMenusConfigured, true);
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});

test("applyVisibleMenuCleanup is idempotent once roles match targets", async () => {
  const roles = createRoles().map((role) => {
    if (!Object.hasOwn(OPERATIONAL_ROLE_MENU_TARGETS, role.name)) return role;
    return {
      ...role,
      visibleMenusConfigured: true,
      visibleMenus: OPERATIONAL_ROLE_MENU_TARGETS[role.name],
    };
  });
  const fakeDb = installFakeDb(roles);

  try {
    const plan = buildVisibleMenuCleanupPlan(roles);
    const result = await applyVisibleMenuCleanup(plan);

    assert.equal(result.modifiedRoles, 0);
    assert.deepEqual(fakeDb.getStats(), {
      bulkWriteCalls: 0,
      sessionDeleteCalls: 0,
    });
  } finally {
    fakeDb.restore();
  }
});

test("admin and super admin remain unrestricted and untouched", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const roles = createRoles();
  const fakeDb = installFakeDb(roles);

  try {
    const beforeAdmin = { ...roles.find((role) => role.name === "ADMIN") };
    const beforeSuper = { ...roles.find((role) => role.name === "SUPER_ADMIN") };

    await runRbacPhase2DVisibleMenuCleanup({ dryRun: false });

    const afterAdmin = roles.find((role) => role.name === "ADMIN");
    const afterSuper = roles.find((role) => role.name === "SUPER_ADMIN");

    assert.deepEqual(afterAdmin, beforeAdmin);
    assert.deepEqual(afterSuper, beforeSuper);
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});

test("second run is idempotent and does not clear sessions again", async () => {
  process.env.MONGO_URI = "mongodb://example.test/commerce_db";
  const roles = createRoles();
  const fakeDb = installFakeDb(roles);

  try {
    const first = await runRbacPhase2DVisibleMenuCleanup({ dryRun: false });
    const firstStats = fakeDb.getStats();
    const second = await runRbacPhase2DVisibleMenuCleanup({ dryRun: false });
    const secondStats = fakeDb.getStats();

    assert.equal(first.modifiedRoles, Object.keys(OPERATIONAL_ROLE_MENU_TARGETS).length);
    assert.equal(first.backendSessionsCleared, 5);
    assert.equal(second.modifiedRoles, 0);
    assert.equal(second.backendSessionsCleared, 0);
    assert.equal(secondStats.bulkWriteCalls, firstStats.bulkWriteCalls);
    assert.equal(secondStats.sessionDeleteCalls, firstStats.sessionDeleteCalls);
  } finally {
    fakeDb.restore();
    delete process.env.MONGO_URI;
  }
});
