import "dotenv/config";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import Role from "../admin-roles/admin-roles.model.js";
import User from "../admin-users/admin-users.model.js";
import Session from "../admin-sessions/admin-sessions.model.js";

export const ORDER_MANAGER_ROLE_NAME = "ORDER_MANAGER";
export const TARGET_USER_EMAIL = "ordermanager@sa.com";
export const TARGET_USER_DEMOTION = {
  isSystemUser: false,
  systemLevel: "NONE",
};
export const ORDER_MANAGER_ROLE_DEMOTION = {
  isSystemRole: false,
  systemLevel: "NONE",
};

function asBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function normalizeRoleDoc(role) {
  return {
    id: String(role?._id || ""),
    name: String(role?.name || ""),
    isSystemRole: !!role?.isSystemRole,
    systemLevel: String(role?.systemLevel || "NONE"),
  };
}

export function getUserProtectionFields(user) {
  if (!user) return [];

  const protections = [];
  if (user.isSystemUser) {
    protections.push({
      field: "isSystemUser",
      currentValue: true,
      nextValue: TARGET_USER_DEMOTION.isSystemUser,
    });
  }
  if (String(user.systemLevel || "NONE") !== "NONE") {
    protections.push({
      field: "systemLevel",
      currentValue: String(user.systemLevel || "NONE"),
      nextValue: TARGET_USER_DEMOTION.systemLevel,
    });
  }

  return protections;
}

export function getOrderManagerProtectionFields(role) {
  if (!role) return [];

  const protections = [];
  if (role.isSystemRole) {
    protections.push({
      field: "isSystemRole",
      currentValue: true,
      nextValue: ORDER_MANAGER_ROLE_DEMOTION.isSystemRole,
    });
  }
  if (String(role.systemLevel || "NONE") !== "NONE") {
    protections.push({
      field: "systemLevel",
      currentValue: String(role.systemLevel || "NONE"),
      nextValue: ORDER_MANAGER_ROLE_DEMOTION.systemLevel,
    });
  }

  return protections;
}

function hasCriticalRole(roleNames = []) {
  return roleNames.includes("ADMIN") || roleNames.includes("SUPER_ADMIN");
}

export function buildRetirementPlan({
  orderManagerRole,
  targetUser,
  resolvedTargetRoles = [],
  usersReferencingOrderManager = [],
} = {}) {
  const normalizedRole = orderManagerRole ? normalizeRoleDoc(orderManagerRole) : null;
  const normalizedResolvedRoles = resolvedTargetRoles.map(normalizeRoleDoc);
  const danglingRoleIds = (targetUser?.roles || [])
    .map((roleId) => String(roleId))
    .filter((roleId) => !normalizedResolvedRoles.some((role) => role.id === roleId));
  const roleNames = normalizedResolvedRoles.map((role) => role.name).filter(Boolean);
  const criticalRolePresent =
    hasCriticalRole(roleNames) || ["ADMIN", "SUPER"].includes(String(targetUser?.systemLevel || "NONE"));

  const normalizedTargetUser = targetUser
    ? {
        id: String(targetUser._id),
        email: String(targetUser.email || ""),
        isSystemUser: !!targetUser.isSystemUser,
        systemLevel: String(targetUser.systemLevel || "NONE"),
        roleIds: (targetUser.roles || []).map((roleId) => String(roleId)),
        resolvedRoles: normalizedResolvedRoles,
        danglingRoleIds,
      }
    : null;

  const normalizedReferencingUsers = usersReferencingOrderManager.map((user) => ({
    id: String(user._id),
    email: String(user.email || ""),
  }));
  const unexpectedReferencingUsers = normalizedReferencingUsers.filter((user) => user.email !== TARGET_USER_EMAIL);

  const validationFailures = [];
  if (normalizedTargetUser && normalizedTargetUser.email !== TARGET_USER_EMAIL) {
    validationFailures.push(`Target user email mismatch: ${normalizedTargetUser.email}`);
  }
  if (criticalRolePresent) {
    validationFailures.push(`${TARGET_USER_EMAIL} has critical system access and cannot be deleted`);
  }
  if (unexpectedReferencingUsers.length > 0) {
    validationFailures.push(
      `Unexpected users still reference ${ORDER_MANAGER_ROLE_NAME}: ${unexpectedReferencingUsers.map((user) => user.email).join(", ")}`
    );
  }

  const userProtectionFields = getUserProtectionFields(normalizedTargetUser);
  const roleProtectionFields = getOrderManagerProtectionFields(normalizedRole);

  return {
    orderManagerRole: normalizedRole,
    targetUser: normalizedTargetUser,
    usersReferencingOrderManager: normalizedReferencingUsers,
    unexpectedReferencingUsers,
    userProtectionFields,
    roleProtectionFields,
    targetUserWouldBeDeleted: !!normalizedTargetUser && !criticalRolePresent,
    orderManagerWouldBeDeleted:
      !!normalizedRole && unexpectedReferencingUsers.length === 0,
    validationFailures,
    isValid: validationFailures.length === 0,
  };
}

export async function demoteTargetUser(userId) {
  const result = await User.updateOne({ _id: userId }, { $set: TARGET_USER_DEMOTION });
  return { modifiedUsers: Number(result.modifiedCount || result.nModified || 0) };
}

export async function deleteTargetUser(userId) {
  const result = await User.deleteOne({ _id: userId });
  return { deletedUsers: Number(result.deletedCount || 0) };
}

export async function demoteOrderManagerRole(roleId) {
  const result = await Role.updateOne({ _id: roleId }, { $set: ORDER_MANAGER_ROLE_DEMOTION });
  return { modifiedRoles: Number(result.modifiedCount || result.nModified || 0) };
}

export async function deleteOrderManagerRole(roleId) {
  const result = await Role.deleteOne({ _id: roleId });
  return { deletedRoles: Number(result.deletedCount || 0) };
}

export async function clearAdminSessions() {
  const result = await Session.deleteMany({});
  return { clearedSessions: Number(result.deletedCount || 0) };
}

export function printRetirementPlan({ dryRun, plan }) {
  console.log("=== Retire ORDER_MANAGER User/Role ===");
  console.log(`dryRun: ${dryRun}`);
  console.log(`targetUserEmail: ${TARGET_USER_EMAIL}`);
  console.log(`targetUserExists: ${!!plan.targetUser}`);
  console.log(`orderManagerExists: ${!!plan.orderManagerRole}`);

  if (plan.targetUser) {
    console.log(`targetUserIsSystemUser: ${plan.targetUser.isSystemUser}`);
    console.log(`targetUserSystemLevel: ${plan.targetUser.systemLevel}`);
    console.log(
      `targetUserResolvedRoles: ${plan.targetUser.resolvedRoles.map((role) => role.name).join(", ") || "(none)"}`
    );
    console.log(`targetUserDanglingRoleIds: ${plan.targetUser.danglingRoleIds.join(", ") || "(none)"}`);
    console.log(`targetUserWouldBeDeleted: ${plan.targetUserWouldBeDeleted}`);
    if (plan.userProtectionFields.length > 0) {
      console.log("User protection fields to clear before deletion:");
      for (const field of plan.userProtectionFields) {
        console.log(`- ${field.field}: ${field.currentValue} -> ${field.nextValue}`);
      }
    } else {
      console.log("User protection fields to clear before deletion: (none)");
    }
  } else {
    console.log("targetUserWouldBeDeleted: false");
  }

  if (plan.orderManagerRole) {
    console.log(`orderManagerRoleId: ${plan.orderManagerRole.id}`);
    console.log(`orderManagerIsSystemRole: ${plan.orderManagerRole.isSystemRole}`);
    console.log(`orderManagerSystemLevel: ${plan.orderManagerRole.systemLevel}`);
    console.log(
      `usersReferencingOrderManager: ${plan.usersReferencingOrderManager.map((user) => user.email).join(", ") || "(none)"}`
    );
    console.log(`orderManagerWouldBeDeleted: ${plan.orderManagerWouldBeDeleted}`);
    if (plan.roleProtectionFields.length > 0) {
      console.log("ORDER_MANAGER protection fields to clear before deletion:");
      for (const field of plan.roleProtectionFields) {
        console.log(`- ${field.field}: ${field.currentValue} -> ${field.nextValue}`);
      }
    } else {
      console.log("ORDER_MANAGER protection fields to clear before deletion: (none)");
    }
  } else {
    console.log("orderManagerWouldBeDeleted: false");
  }

  if (plan.validationFailures.length > 0) {
    console.log("Validation failures:");
    for (const failure of plan.validationFailures) {
      console.log(`- ${failure}`);
    }
  }
}

export async function runRetireOrderManagerMigration({
  dryRun = asBoolean(process.env.DRY_RUN),
} = {}) {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing in env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const [orderManagerRole, targetUser] = await Promise.all([
      Role.findOne({ name: ORDER_MANAGER_ROLE_NAME }).select("_id name isSystemRole systemLevel").lean(),
      User.findOne({ email: TARGET_USER_EMAIL })
        .select("_id email roles isSystemUser systemLevel")
        .lean(),
    ]);

    const roleIds = (targetUser?.roles || []).map((roleId) => String(roleId));
    const [resolvedTargetRoles, usersReferencingOrderManager] = await Promise.all([
      roleIds.length
        ? Role.find({ _id: { $in: roleIds } }).select("_id name isSystemRole systemLevel").lean()
        : [],
      orderManagerRole
        ? User.find({ roles: orderManagerRole._id }).select("_id email").lean()
        : [],
    ]);

    const plan = buildRetirementPlan({
      orderManagerRole,
      targetUser,
      resolvedTargetRoles,
      usersReferencingOrderManager,
    });

    printRetirementPlan({ dryRun, plan });
    console.log(`backendSessionsWouldBeCleared: ${!dryRun && (plan.targetUserWouldBeDeleted || plan.orderManagerWouldBeDeleted) && plan.isValid}`);

    if (!plan.isValid) {
      throw new Error(`ORDER_MANAGER retirement validation failed: ${plan.validationFailures.join("; ")}`);
    }

    if (!plan.targetUser && !plan.orderManagerRole) {
      console.log("✅ Target user and ORDER_MANAGER role are already absent. No data was modified.");
      return {
        dryRun,
        targetUserExists: false,
        orderManagerExists: false,
        demotedUsers: 0,
        deletedUsers: 0,
        demotedRoles: 0,
        deletedRoles: 0,
        backendSessionsCleared: 0,
      };
    }

    if (dryRun) {
      console.log("✅ ORDER_MANAGER retirement dry run complete. No data was modified.");
      return {
        dryRun: true,
        targetUserExists: !!plan.targetUser,
        orderManagerExists: !!plan.orderManagerRole,
        demotedUsers: 0,
        deletedUsers: 0,
        demotedRoles: 0,
        deletedRoles: 0,
        backendSessionsCleared: 0,
      };
    }

    let demotedUsers = 0;
    let deletedUsers = 0;

    if (plan.targetUser) {
      if (plan.userProtectionFields.length > 0) {
        const demotionResult = await demoteTargetUser(plan.targetUser.id);
        demotedUsers = demotionResult.modifiedUsers;
      }
      const deleteUserResult = await deleteTargetUser(plan.targetUser.id);
      deletedUsers = deleteUserResult.deletedUsers;
    }

    let demotedRoles = 0;
    let deletedRoles = 0;

    if (plan.orderManagerRole) {
      const remainingReferences = await User.countDocuments({ roles: plan.orderManagerRole.id });
      if (remainingReferences > 0) {
        throw new Error(`ORDER_MANAGER still referenced by ${remainingReferences} user(s) after target user deletion`);
      }

      if (plan.roleProtectionFields.length > 0) {
        const demotionResult = await demoteOrderManagerRole(plan.orderManagerRole.id);
        demotedRoles = demotionResult.modifiedRoles;
      }
      const deleteRoleResult = await deleteOrderManagerRole(plan.orderManagerRole.id);
      deletedRoles = deleteRoleResult.deletedRoles;
    }

    const mutated = demotedUsers > 0 || deletedUsers > 0 || demotedRoles > 0 || deletedRoles > 0;
    let clearedSessions = 0;
    if (mutated) {
      const sessionResult = await clearAdminSessions();
      clearedSessions = sessionResult.clearedSessions;
    }

    console.log(`✅ Users demoted: ${demotedUsers}`);
    console.log(`✅ Users deleted: ${deletedUsers}`);
    console.log(`✅ Roles demoted: ${demotedRoles}`);
    console.log(`✅ Roles deleted: ${deletedRoles}`);
    console.log(`✅ Admin sessions cleared: ${clearedSessions}`);
    console.log("✅ ORDER_MANAGER retirement complete");

    return {
      dryRun: false,
      targetUserExists: !!plan.targetUser,
      orderManagerExists: !!plan.orderManagerRole,
      demotedUsers,
      deletedUsers,
      demotedRoles,
      deletedRoles,
      backendSessionsCleared: clearedSessions,
    };
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRetireOrderManagerMigration().catch(async (error) => {
    console.error("❌ ORDER_MANAGER retirement failed:", error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
}
