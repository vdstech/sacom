import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_MENU_IDS,
} from "../admin-roles/admin-menu-catalog.js";
import {
  DEPRECATED_PERMISSION_CODES,
  REQUIRED_PHASE1_PERMISSION_CODES,
  analyzeActionWithoutReadWarnings,
  analyzeDeprecatedPermissionUsage,
  analyzeMissingPhase1Codes,
  analyzePermissionWithoutMenuWarnings,
  analyzeRoleMenuMismatchWarnings,
  buildAuditSummary,
  computeSafeToStartPhase2B,
  getEffectiveVisibleMenus,
} from "./auditRbacPhase2.js";

function buildRole(overrides = {}) {
  const permissionCodes = overrides.permissionCodes || [];
  const visibleMenusConfigured = overrides.visibleMenusConfigured ?? true;
  const visibleMenus = overrides.visibleMenus || [];
  const roleLike = {
    visibleMenusConfigured,
    visibleMenus,
  };
  return {
    id: overrides.id || "role-1",
    name: overrides.name || "ROLE",
    visibleMenusConfigured,
    visibleMenus,
    effectiveVisibleMenus: overrides.effectiveVisibleMenus || getEffectiveVisibleMenus(roleLike, ADMIN_MENU_IDS),
    permissionCodes,
    permissionCodeSet: new Set(permissionCodes),
  };
}

test("deprecated usage analysis reports roles and users for deprecated codes", () => {
  const permissionCodeSet = new Set([...DEPRECATED_PERMISSION_CODES, "category:read"]);
  const roles = [
    buildRole({ name: "ADMIN", permissionCodes: ["category:write", "category:read"] }),
    buildRole({ name: "STOREMANAGER", permissionCodes: ["category:write"] }),
  ];
  const users = [
    { email: "admin@sa.com", roleNames: ["ADMIN"] },
    { email: "store@sa.com", roleNames: ["STOREMANAGER"] },
  ];

  const deprecatedUsage = analyzeDeprecatedPermissionUsage(permissionCodeSet, roles, users);
  const categoryWrite = deprecatedUsage.find((entry) => entry.code === "category:write");

  assert.equal(categoryWrite.exists, true);
  assert.deepEqual(categoryWrite.roles, ["ADMIN", "STOREMANAGER"]);
  assert.deepEqual(categoryWrite.users, ["admin@sa.com", "store@sa.com"]);
});

test("missing Phase 1 code analysis reports absent codes", () => {
  const permissionCodeSet = new Set(["category:create", "category:update", "order:return"]);

  const missing = analyzeMissingPhase1Codes(permissionCodeSet);

  assert.equal(missing.includes("product:create"), true);
  assert.equal(missing.includes("order:return"), false);
});

test("warning analyses detect menu mismatches, action/read gaps, and permission/menu gaps", () => {
  const roles = [
    buildRole({
      name: "BROKEN_ROLE",
      visibleMenusConfigured: true,
      visibleMenus: ["products", "shippingOperator"],
      effectiveVisibleMenus: ["products", "shippingOperator"],
      permissionCodes: ["product:update", "order:shipping"],
    }),
    buildRole({
      name: "RETURN_ROLE",
      visibleMenusConfigured: true,
      visibleMenus: [],
      effectiveVisibleMenus: [],
      permissionCodes: ["order:read", "order:return"],
    }),
  ];

  const roleMenuWarnings = analyzeRoleMenuMismatchWarnings(roles);
  const actionWarnings = analyzeActionWithoutReadWarnings(roles);
  const permissionMenuWarnings = analyzePermissionWithoutMenuWarnings(roles);

  assert.equal(roleMenuWarnings.some((warning) => warning.message.includes("products menu is visible but product:read is missing")), true);
  assert.equal(actionWarnings.some((warning) => warning.message.includes("product:update present but product:read is missing")), true);
  assert.equal(permissionMenuWarnings.some((warning) => warning.message.includes("order:return present but returnExchangeManager menu is not visible")), true);
});

test("safeToStartPhase2B is false when replacement permissions or required Phase 1 codes are missing", () => {
  const permissionCodeSet = new Set(REQUIRED_PHASE1_PERMISSION_CODES.filter((code) => code !== "order:packaging"));
  const roles = [
    buildRole({ name: "PACKAGING_MANAGER", permissionCodes: ["order:pack"] }),
    buildRole({ name: "SHIPPING_MANAGER", permissionCodes: ["order:shipping"] }),
    buildRole({ name: "ORDER_OPERATIONS", permissionCodes: ["order:processing", "order:shipping", "order:cancellation"] }),
    buildRole({ name: "INVENTORY_MANAGER", permissionCodes: ["inventory:read"] }),
  ];

  assert.equal(computeSafeToStartPhase2B(permissionCodeSet, roles), false);
});

test("safeToStartPhase2B is true only when all required Phase 1 role replacements exist", () => {
  const permissionCodeSet = new Set(REQUIRED_PHASE1_PERMISSION_CODES);
  const roles = [
    buildRole({ name: "PACKAGING_MANAGER", permissionCodes: ["order:read", "order:packaging"] }),
    buildRole({ name: "SHIPPING_MANAGER", permissionCodes: ["order:read", "order:shipping"] }),
    buildRole({ name: "ORDER_OPERATIONS", permissionCodes: ["order:read", "order:processing", "order:packaging", "order:shipping", "order:cancellation"] }),
    buildRole({ name: "INVENTORY_MANAGER", permissionCodes: ["inventory:read", "product:inventory:update"] }),
  ];

  assert.equal(computeSafeToStartPhase2B(permissionCodeSet, roles), true);
});

test("summary totals count findings without treating warnings as failures", () => {
  const summary = buildAuditSummary({
    roles: [{}, {}, {}],
    users: [{}, {}],
    deprecatedUsage: [
      { roles: ["A", "B"] },
      { roles: ["C"] },
    ],
    missingPhase1Codes: ["product:create"],
    allWarnings: [{}, {}, {}],
    safeToStartPhase2B: false,
  });

  assert.deepEqual(summary, {
    totalRolesScanned: 3,
    totalUsersScanned: 2,
    totalDeprecatedPermissionUsages: 3,
    totalMissingPhase1Codes: 1,
    totalMenuPermissionWarnings: 3,
    safeToStartPhase2B: false,
  });
});
