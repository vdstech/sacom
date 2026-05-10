import "dotenv/config";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import Permission from "../admin-permissions/admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";
import Session from "../admin-sessions/admin-sessions.model.js";
import { DEPRECATED_PERMISSION_CODES } from "./seedCategoryPermissions.js";

export { DEPRECATED_PERMISSION_CODES };

export const DEPRECATED_REPLACEMENT_MAP = {
  "category:write": ["category:create", "category:update"],
  "product:write": ["product:create", "product:update"],
  "inventory:write": ["product:inventory:update"],
  "order:write": ["order:admin"],
  "order:delete": ["order:admin"],
  "order:pack": ["order:packaging"],
  "order:ship": ["order:shipping"],
};

function asBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

export function hydrateRolesForCleanup(rawRoles = [], permissionCodeById = new Map()) {
  return rawRoles.map((role) => {
    const permissionIds = (role.permissions || []).map((permissionId) => String(permissionId));
    const permissionCodes = permissionIds
      .map((permissionId) => permissionCodeById.get(permissionId))
      .filter(Boolean)
      .sort();

    return {
      id: String(role._id),
      name: String(role.name || ""),
      permissionIds,
      permissionCodes,
      permissionCodeSet: new Set(permissionCodes),
    };
  });
}

export function validateCleanupState(permissionCodeSet, roles = []) {
  const missingReplacementCodes = Array.from(
    new Set(
      Object.values(DEPRECATED_REPLACEMENT_MAP)
        .flat()
        .filter((code) => !permissionCodeSet.has(code))
    )
  ).sort();

  const roleValidationFailures = [];

  for (const role of roles) {
    for (const deprecatedCode of DEPRECATED_PERMISSION_CODES) {
      if (!role.permissionCodeSet.has(deprecatedCode)) continue;
      const requiredReplacements = DEPRECATED_REPLACEMENT_MAP[deprecatedCode] || [];
      const missingReplacements = requiredReplacements.filter((code) => !role.permissionCodeSet.has(code));
      if (missingReplacements.length > 0) {
        roleValidationFailures.push({
          roleName: role.name,
          deprecatedCode,
          missingReplacements,
        });
      }
    }
  }

  return {
    missingReplacementCodes,
    roleValidationFailures,
    isValid: missingReplacementCodes.length === 0 && roleValidationFailures.length === 0,
  };
}

export function buildRoleCleanupPlan(roles = [], deprecatedCodeToId = new Map()) {
  return roles
    .map((role) => {
      const deprecatedCodesPresent = DEPRECATED_PERMISSION_CODES.filter((code) => role.permissionCodeSet.has(code));
      const deprecatedPermissionIds = deprecatedCodesPresent
        .map((code) => deprecatedCodeToId.get(code))
        .filter(Boolean)
        .map((id) => String(id));

      const nextPermissionIds = role.permissionIds.filter((permissionId) => !deprecatedPermissionIds.includes(String(permissionId)));

      return {
        roleId: role.id,
        roleName: role.name,
        deprecatedCodesPresent,
        deprecatedPermissionIds,
        currentPermissionIds: role.permissionIds,
        nextPermissionIds,
        changed: deprecatedPermissionIds.length > 0 && nextPermissionIds.length !== role.permissionIds.length,
      };
    })
    .filter((entry) => entry.deprecatedCodesPresent.length > 0);
}

export async function removeDeprecatedPermissionsFromRoles(plan = []) {
  const changedEntries = plan.filter((entry) => entry.changed);
  if (!changedEntries.length) {
    return { modifiedRoles: 0 };
  }

  const result = await Role.bulkWrite(
    changedEntries.map((entry) => ({
      updateOne: {
        filter: { _id: entry.roleId },
        update: { $set: { permissions: entry.nextPermissionIds } },
      },
    }))
  );

  return {
    modifiedRoles: Number(result.modifiedCount || result.nModified || changedEntries.length || 0),
  };
}

export async function assertNoDeprecatedRoleReferences(deprecatedPermissionIds = []) {
  if (!deprecatedPermissionIds.length) return;

  const remaining = await Role.findOne({ permissions: { $in: deprecatedPermissionIds } }).select("name").lean();
  if (remaining) {
    throw new Error(`Deprecated permission references still exist on role ${remaining.name}`);
  }
}

export async function deleteDeprecatedPermissionDocuments(deprecatedPermissionIds = []) {
  if (!deprecatedPermissionIds.length) {
    return { deletedPermissions: 0 };
  }

  const result = await Permission.deleteMany({ _id: { $in: deprecatedPermissionIds } });
  return { deletedPermissions: Number(result.deletedCount || 0) };
}

export async function clearAdminSessions() {
  const result = await Session.deleteMany({});
  return { clearedSessions: Number(result.deletedCount || 0) };
}

export async function loadPhase2CData() {
  const [permissions, roles] = await Promise.all([
    Permission.find().select("_id code description").lean(),
    Role.find().select("_id name permissions").lean(),
  ]);

  const permissionCodeSet = new Set(
    permissions
      .map((permission) => String(permission.code || "").trim())
      .filter(Boolean)
  );
  const permissionCodeById = new Map(
    permissions.map((permission) => [String(permission._id), String(permission.code || "").trim()])
  );
  const deprecatedDocs = permissions.filter((permission) => DEPRECATED_PERMISSION_CODES.includes(String(permission.code || "").trim()));
  const deprecatedCodeToId = new Map(
    deprecatedDocs.map((permission) => [String(permission.code || "").trim(), String(permission._id)])
  );

  return {
    permissions,
    roles: hydrateRolesForCleanup(roles, permissionCodeById),
    permissionCodeSet,
    deprecatedDocs,
    deprecatedCodeToId,
  };
}

export function printCleanupPlan(plan = [], { dryRun, deleteDeprecatedDocs }) {
  console.log("=== Phase 2C Deprecated Permission Cleanup ===");
  console.log(`dryRun: ${dryRun}`);
  console.log(`deleteDeprecatedPermissionDocs: ${deleteDeprecatedDocs}`);

  if (!plan.length) {
    console.log("No roles currently carry deprecated permission IDs.");
    return;
  }

  console.log("Roles with deprecated permissions:");
  for (const entry of plan) {
    console.log(`- ${entry.roleName}`);
    console.log(`  deprecatedCodes: ${entry.deprecatedCodesPresent.join(", ")}`);
    console.log(`  wouldRemovePermissionIds: ${entry.deprecatedPermissionIds.join(", ") || "(none)"}`);
    console.log(`  roleWillChange: ${entry.changed}`);
  }
}

export async function runRbacPhase2CCleanup({
  dryRun = asBoolean(process.env.DRY_RUN),
  deleteDeprecatedPermissionDocs: shouldDeleteDeprecatedPermissionDocs = asBoolean(process.env.DELETE_DEPRECATED_PERMISSION_DOCS),
} = {}) {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing in env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const { roles, permissionCodeSet, deprecatedDocs, deprecatedCodeToId } = await loadPhase2CData();
    const validation = validateCleanupState(permissionCodeSet, roles);

    if (!validation.isValid) {
      if (validation.missingReplacementCodes.length) {
        console.error("Missing replacement permission codes:", validation.missingReplacementCodes.join(", "));
      }
      for (const failure of validation.roleValidationFailures) {
        console.error(
          `Role ${failure.roleName} still has ${failure.deprecatedCode} but is missing replacements: ${failure.missingReplacements.join(", ")}`
        );
      }
      throw new Error("Phase 2C validation failed");
    }

    const cleanupPlan = buildRoleCleanupPlan(roles, deprecatedCodeToId);
    printCleanupPlan(cleanupPlan, { dryRun, deleteDeprecatedDocs: shouldDeleteDeprecatedPermissionDocs });

    const deprecatedPermissionIds = deprecatedDocs.map((permission) => String(permission._id));
    const rolesWouldChange = cleanupPlan.filter((entry) => entry.changed).length;

    console.log(`deprecatedPermissionDocumentsFound: ${deprecatedDocs.length}`);
    console.log(`rolesWithDeprecatedPermissions: ${cleanupPlan.length}`);
    console.log(`rolesThatWouldChange: ${rolesWouldChange}`);
    console.log(`deprecatedPermissionDocsWouldBeDeleted: ${shouldDeleteDeprecatedPermissionDocs}`);
    console.log(`backendSessionsWouldBeCleared: ${!dryRun && (rolesWouldChange > 0 || shouldDeleteDeprecatedPermissionDocs)}`);

    if (dryRun) {
      console.log("✅ Phase 2C dry run complete. No data was modified.");
      return {
        dryRun: true,
        deprecatedPermissionDocumentsFound: deprecatedDocs.length,
        rolesWithDeprecatedPermissions: cleanupPlan.length,
        rolesThatWouldChange: rolesWouldChange,
        deprecatedPermissionDocsDeleted: false,
        backendSessionsCleared: false,
      };
    }

    const roleCleanupResult = await removeDeprecatedPermissionsFromRoles(cleanupPlan);

    let deletedPermissions = 0;
    if (shouldDeleteDeprecatedPermissionDocs) {
      await assertNoDeprecatedRoleReferences(deprecatedPermissionIds);
      const deleteResult = await deleteDeprecatedPermissionDocuments(deprecatedPermissionIds);
      deletedPermissions = deleteResult.deletedPermissions;
    }

    const mutated = roleCleanupResult.modifiedRoles > 0 || deletedPermissions > 0;
    let clearedSessions = 0;
    if (mutated) {
      const sessionResult = await clearAdminSessions();
      clearedSessions = sessionResult.clearedSessions;
    }

    console.log(`✅ Roles updated: ${roleCleanupResult.modifiedRoles}`);
    console.log(`✅ Deprecated permission docs deleted: ${deletedPermissions}`);
    console.log(`✅ Admin sessions cleared: ${clearedSessions}`);
    console.log("✅ Phase 2C cleanup complete");

    return {
      dryRun: false,
      deprecatedPermissionDocumentsFound: deprecatedDocs.length,
      rolesWithDeprecatedPermissions: cleanupPlan.length,
      rolesThatWouldChange: rolesWouldChange,
      modifiedRoles: roleCleanupResult.modifiedRoles,
      deprecatedPermissionDocsDeleted: deletedPermissions,
      backendSessionsCleared: clearedSessions,
    };
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRbacPhase2CCleanup().catch(async (error) => {
    console.error("❌ Phase 2C cleanup failed:", error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
}
