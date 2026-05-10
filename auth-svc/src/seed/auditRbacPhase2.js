import "dotenv/config";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import Permission from "../admin-permissions/admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";
import User from "../admin-users/admin-users.model.js";
import Session from "../admin-sessions/admin-sessions.model.js";
import { ADMIN_MENU_IDS, normalizeVisibleMenus } from "../admin-roles/admin-menu-catalog.js";

export const DEPRECATED_PERMISSION_CODES = [
  "category:write",
  "product:write",
  "inventory:write",
  "order:write",
  "order:delete",
  "order:pack",
  "order:ship",
];

export const REQUIRED_PHASE1_PERMISSION_CODES = [
  "category:create",
  "category:update",
  "product:create",
  "product:update",
  "product:inventory:update",
  "order:admin",
  "order:processing",
  "order:packaging",
  "order:shipping",
  "order:cancellation",
  "order:cancel",
  "order:cancel:manage",
  "order:return",
];

const MENU_PERMISSION_REQUIREMENTS = [
  { menuId: "categories", permissionCode: "category:read" },
  { menuId: "products", permissionCode: "product:read" },
  { menuId: "inventory", permissionCode: "inventory:read" },
  { menuId: "returnExchangeManager", permissionCode: "order:return" },
  { menuId: "shippingOperator", permissionCode: "order:shipping" },
  { menuId: "packagingManager", permissionCode: "order:packaging" },
  { menuId: "processingManager", permissionCode: "order:processing" },
  { menuId: "cancellationManager", permissionCode: "order:cancellation" },
];

const ACTION_READ_REQUIREMENTS = [
  { requiredRead: "category:read", actionCodes: ["category:create", "category:update", "category:delete"] },
  { requiredRead: "product:read", actionCodes: ["product:create", "product:update", "product:delete", "product:publish"] },
  { requiredRead: "inventory:read", actionCodes: ["product:inventory:update"] },
  { requiredRead: "order:read", actionCodes: ["order:shipping", "order:packaging", "order:processing", "order:cancellation", "order:admin", "order:return"] },
];

const PERMISSION_MENU_REQUIREMENTS = [
  { menuId: "categories", permissionCodes: ["category:read", "category:create", "category:update", "category:delete"] },
  { menuId: "products", permissionCodes: ["product:read", "product:create", "product:update", "product:delete", "product:publish"] },
  { menuId: "inventory", permissionCodes: ["inventory:read", "product:inventory:update"] },
  { menuId: "returnExchangeManager", permissionCodes: ["order:return"] },
  { menuId: "shippingOperator", permissionCodes: ["order:shipping"] },
  { menuId: "packagingManager", permissionCodes: ["order:packaging"] },
  { menuId: "processingManager", permissionCodes: ["order:processing"] },
  { menuId: "cancellationManager", permissionCodes: ["order:cancellation"] },
];

function hasAny(set, values) {
  return values.some((value) => set.has(value));
}

export function getEffectiveVisibleMenus(role, allMenuIds = ADMIN_MENU_IDS) {
  if (!role?.visibleMenusConfigured) {
    return [...allMenuIds];
  }
  return normalizeVisibleMenus(role.visibleMenus || []);
}

export function hydrateRoles(rawRoles = [], permissionCodeById = new Map(), allMenuIds = ADMIN_MENU_IDS) {
  return rawRoles.map((role) => {
    const permissionCodes = (role.permissions || [])
      .map((permissionId) => permissionCodeById.get(String(permissionId)))
      .filter(Boolean)
      .sort();

    return {
      id: String(role._id),
      name: String(role.name || ""),
      visibleMenusConfigured: !!role.visibleMenusConfigured,
      visibleMenus: normalizeVisibleMenus(role.visibleMenus || []),
      effectiveVisibleMenus: getEffectiveVisibleMenus(role, allMenuIds),
      permissionCodes,
      permissionCodeSet: new Set(permissionCodes),
    };
  });
}

export function hydrateUsers(rawUsers = [], roleNameById = new Map()) {
  return rawUsers.map((user) => {
    const roleNames = (user.roles || [])
      .map((roleId) => roleNameById.get(String(roleId)))
      .filter(Boolean)
      .sort();

    return {
      id: String(user._id),
      email: String(user.email || ""),
      roleNames,
    };
  });
}

export function analyzeDeprecatedPermissionUsage(permissionCodeSet, roles = [], users = []) {
  const results = [];

  for (const code of DEPRECATED_PERMISSION_CODES) {
    const rolesWithCode = roles
      .filter((role) => role.permissionCodeSet.has(code))
      .map((role) => role.name)
      .sort();
    const usersWithCode = users
      .filter((user) => user.roleNames.some((roleName) => rolesWithCode.includes(roleName)))
      .map((user) => user.email)
      .sort();

    results.push({
      code,
      exists: permissionCodeSet.has(code),
      roles: rolesWithCode,
      users: usersWithCode,
    });
  }

  return results;
}

export function analyzeMissingPhase1Codes(permissionCodeSet) {
  return REQUIRED_PHASE1_PERMISSION_CODES.filter((code) => !permissionCodeSet.has(code));
}

export function analyzeRoleMenuMismatchWarnings(roles = []) {
  const warnings = [];

  for (const role of roles) {
    const menuSet = new Set(role.effectiveVisibleMenus || []);
    for (const rule of MENU_PERMISSION_REQUIREMENTS) {
      if (menuSet.has(rule.menuId) && !role.permissionCodeSet.has(rule.permissionCode)) {
        warnings.push({
          roleName: role.name,
          type: "role-menu-mismatch",
          message: `${role.name}: ${rule.menuId} menu is visible but ${rule.permissionCode} is missing`,
        });
      }
    }
  }

  return warnings;
}

export function analyzeActionWithoutReadWarnings(roles = []) {
  const warnings = [];

  for (const role of roles) {
    for (const rule of ACTION_READ_REQUIREMENTS) {
      if (hasAny(role.permissionCodeSet, rule.actionCodes) && !role.permissionCodeSet.has(rule.requiredRead)) {
        const activeCodes = rule.actionCodes.filter((code) => role.permissionCodeSet.has(code)).join(", ");
        warnings.push({
          roleName: role.name,
          type: "action-without-read",
          message: `${role.name}: ${activeCodes} present but ${rule.requiredRead} is missing`,
        });
      }
    }
  }

  return warnings;
}

export function analyzePermissionWithoutMenuWarnings(roles = []) {
  const warnings = [];

  for (const role of roles) {
    const menuSet = new Set(role.effectiveVisibleMenus || []);
    for (const rule of PERMISSION_MENU_REQUIREMENTS) {
      if (hasAny(role.permissionCodeSet, rule.permissionCodes) && !menuSet.has(rule.menuId)) {
        const activeCodes = rule.permissionCodes.filter((code) => role.permissionCodeSet.has(code)).join(", ");
        warnings.push({
          roleName: role.name,
          type: "permission-without-menu",
          message: `${role.name}: ${activeCodes} present but ${rule.menuId} menu is not visible`,
        });
      }
    }
  }

  return warnings;
}

export function analyzeDeprecatedReplacementGaps(roles = []) {
  const gaps = [];

  for (const role of roles) {
    if (role.permissionCodeSet.has("order:pack") && !role.permissionCodeSet.has("order:packaging")) {
      gaps.push({ roleName: role.name, deprecatedCode: "order:pack", replacementCode: "order:packaging" });
    }
    if (role.permissionCodeSet.has("order:ship") && !role.permissionCodeSet.has("order:shipping")) {
      gaps.push({ roleName: role.name, deprecatedCode: "order:ship", replacementCode: "order:shipping" });
    }
    if (
      (role.permissionCodeSet.has("order:write") || role.permissionCodeSet.has("order:delete")) &&
      !role.permissionCodeSet.has("order:admin")
    ) {
      gaps.push({ roleName: role.name, deprecatedCode: "order:write|order:delete", replacementCode: "order:admin" });
    }
  }

  return gaps;
}

export function computeSafeToStartPhase2B(permissionCodeSet, roles = []) {
  const missingPhase1Codes = analyzeMissingPhase1Codes(permissionCodeSet);
  if (missingPhase1Codes.length > 0) return false;

  if (analyzeDeprecatedReplacementGaps(roles).length > 0) return false;

  const roleByName = new Map(roles.map((role) => [role.name, role]));
  const requiredRolePermissions = [
    ["PACKAGING_MANAGER", ["order:packaging"]],
    ["SHIPPING_MANAGER", ["order:shipping"]],
    ["ORDER_OPERATIONS", ["order:processing", "order:packaging", "order:shipping", "order:cancellation"]],
    ["INVENTORY_MANAGER", ["product:inventory:update"]],
  ];

  return requiredRolePermissions.every(([roleName, codes]) => {
    const role = roleByName.get(roleName);
    if (!role) return false;
    return codes.every((code) => role.permissionCodeSet.has(code));
  });
}

export function buildAuditSummary({ roles = [], users = [], deprecatedUsage = [], missingPhase1Codes = [], allWarnings = [], safeToStartPhase2B = false }) {
  return {
    totalRolesScanned: roles.length,
    totalUsersScanned: users.length,
    totalDeprecatedPermissionUsages: deprecatedUsage.reduce((total, entry) => total + entry.roles.length, 0),
    totalMissingPhase1Codes: missingPhase1Codes.length,
    totalMenuPermissionWarnings: allWarnings.length,
    safeToStartPhase2B,
  };
}

export async function loadAuditData() {
  const [permissions, roles, users, sessionCount] = await Promise.all([
    Permission.find().select("_id code").lean(),
    Role.find().select("_id name permissions visibleMenus visibleMenusConfigured").lean(),
    User.find().select("_id email roles").lean(),
    Session.countDocuments(),
  ]);

  const permissionCodeSet = new Set(permissions.map((permission) => String(permission.code || "").trim()).filter(Boolean));
  const permissionCodeById = new Map(
    permissions.map((permission) => [String(permission._id), String(permission.code || "").trim()])
  );
  const hydratedRoles = hydrateRoles(roles, permissionCodeById, ADMIN_MENU_IDS);
  const roleNameById = new Map(hydratedRoles.map((role) => [role.id, role.name]));
  const hydratedUsers = hydrateUsers(users, roleNameById);

  return {
    permissionCodeSet,
    roles: hydratedRoles,
    users: hydratedUsers,
    sessionCount,
  };
}

function printDeprecatedUsage(entries) {
  console.log("A. Deprecated permission usage");
  for (const entry of entries) {
    console.log(`- ${entry.code}`);
    console.log(`  exists: ${entry.exists}`);
    console.log(`  roles: ${entry.roles.length ? entry.roles.join(", ") : "(none)"}`);
    console.log(`  users: ${entry.users.length ? entry.users.join(", ") : "(none)"}`);
  }
  console.log("");
}

function printMissingPhase1Codes(missingCodes) {
  console.log("B. Missing Phase 1 permission codes");
  console.log(`- missing: ${missingCodes.length ? missingCodes.join(", ") : "(none)"}`);
  console.log("");
}

function printWarnings(title, warnings) {
  console.log(title);
  if (!warnings.length) {
    console.log("- (none)");
    console.log("");
    return;
  }

  for (const warning of warnings) {
    console.log(`- ${warning.message}`);
  }
  console.log("");
}

export async function runRbacPhase2Audit() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing in env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const { permissionCodeSet, roles, users, sessionCount } = await loadAuditData();
    const deprecatedUsage = analyzeDeprecatedPermissionUsage(permissionCodeSet, roles, users);
    const missingPhase1Codes = analyzeMissingPhase1Codes(permissionCodeSet);
    const roleMenuWarnings = analyzeRoleMenuMismatchWarnings(roles);
    const actionWithoutReadWarnings = analyzeActionWithoutReadWarnings(roles);
    const permissionWithoutMenuWarnings = analyzePermissionWithoutMenuWarnings(roles);
    const safeToStartPhase2B = computeSafeToStartPhase2B(permissionCodeSet, roles);
    const allWarnings = [
      ...roleMenuWarnings,
      ...actionWithoutReadWarnings,
      ...permissionWithoutMenuWarnings,
    ];
    const summary = buildAuditSummary({
      roles,
      users,
      deprecatedUsage,
      missingPhase1Codes,
      allWarnings,
      safeToStartPhase2B,
    });

    console.log("=== Phase 2A RBAC Audit ===");
    console.log("");
    printDeprecatedUsage(deprecatedUsage);
    printMissingPhase1Codes(missingPhase1Codes);
    printWarnings("C. Role/menu mismatch warnings", roleMenuWarnings);
    printWarnings("D. Action permission without read permission", actionWithoutReadWarnings);
    printWarnings("E. Permission without related visible menu", permissionWithoutMenuWarnings);
    console.log("F. Summary");
    console.log(`Active admin sessions observed: ${sessionCount}`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRbacPhase2Audit().catch(async (error) => {
    console.error("❌ Phase 2A RBAC audit failed:", error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
}
