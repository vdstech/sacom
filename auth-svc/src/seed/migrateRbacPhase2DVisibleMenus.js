import "dotenv/config";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import Role from "../admin-roles/admin-roles.model.js";
import Session from "../admin-sessions/admin-sessions.model.js";
import { normalizeVisibleMenus } from "../admin-roles/admin-menu-catalog.js";

export const OPERATIONAL_ROLE_MENU_TARGETS = {
  STOREMANAGER: ["categories", "products", "inventory"],
  ORDER_MANAGER: ["ordersDashboard", "ordersMetrics", "orders", "packagingManager", "shippingOperator"],
  ORDER_OPERATIONS: ["ordersDashboard", "ordersMetrics", "processingManager", "packagingManager", "shippingOperator", "cancellationManager", "orders"],
  PACKAGING_MANAGER: ["packagingManager"],
  SHIPPING_MANAGER: ["shippingOperator"],
  RETURN_MANAGER: ["returnExchangeManager"],
  INVENTORY_MANAGER: ["inventory"],
};

function asBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function arraysEqual(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function buildVisibleMenuCleanupPlan(rawRoles = []) {
  const rolesByName = new Map(rawRoles.map((role) => [String(role.name || ""), role]));

  return Object.entries(OPERATIONAL_ROLE_MENU_TARGETS).map(([roleName, targetMenus]) => {
    const role = rolesByName.get(roleName);
    const normalizedTargetMenus = normalizeVisibleMenus(targetMenus);

    if (!role) {
      return {
        roleId: null,
        roleName,
        exists: false,
        currentVisibleMenusConfigured: null,
        currentVisibleMenus: [],
        targetVisibleMenusConfigured: true,
        targetVisibleMenus: normalizedTargetMenus,
        changed: false,
      };
    }

    const currentVisibleMenus = normalizeVisibleMenus(role.visibleMenus || []);
    const currentVisibleMenusConfigured = !!role.visibleMenusConfigured;

    return {
      roleId: String(role._id),
      roleName,
      exists: true,
      currentVisibleMenusConfigured,
      currentVisibleMenus,
      targetVisibleMenusConfigured: true,
      targetVisibleMenus: normalizedTargetMenus,
      changed:
        currentVisibleMenusConfigured !== true ||
        !arraysEqual(currentVisibleMenus, normalizedTargetMenus),
    };
  });
}

export async function applyVisibleMenuCleanup(plan = []) {
  const changedEntries = plan.filter((entry) => entry.exists && entry.changed);
  if (!changedEntries.length) {
    return { modifiedRoles: 0 };
  }

  const result = await Role.bulkWrite(
    changedEntries.map((entry) => ({
      updateOne: {
        filter: { _id: entry.roleId },
        update: {
          $set: {
            visibleMenusConfigured: true,
            visibleMenus: entry.targetVisibleMenus,
          },
        },
      },
    }))
  );

  return {
    modifiedRoles: Number(result.modifiedCount || result.nModified || changedEntries.length || 0),
  };
}

export async function clearAdminSessions() {
  const result = await Session.deleteMany({});
  return { clearedSessions: Number(result.deletedCount || 0) };
}

export function printVisibleMenuCleanupPlan(plan = [], dryRun = false) {
  console.log("=== Phase 2D Visible Menu Cleanup ===");
  console.log(`dryRun: ${dryRun}`);

  for (const entry of plan) {
    console.log(`- ${entry.roleName}`);
    if (!entry.exists) {
      console.log("  exists: false");
      console.log(`  targetVisibleMenusConfigured: ${entry.targetVisibleMenusConfigured}`);
      console.log(`  targetVisibleMenus: ${entry.targetVisibleMenus.join(", ") || "(none)"}`);
      continue;
    }

    console.log("  exists: true");
    console.log(`  currentVisibleMenusConfigured: ${entry.currentVisibleMenusConfigured}`);
    console.log(`  currentVisibleMenus: ${entry.currentVisibleMenus.join(", ") || "(none)"}`);
    console.log(`  targetVisibleMenusConfigured: ${entry.targetVisibleMenusConfigured}`);
    console.log(`  targetVisibleMenus: ${entry.targetVisibleMenus.join(", ") || "(none)"}`);
    console.log(`  roleWillChange: ${entry.changed}`);
  }
}

export async function runRbacPhase2DVisibleMenuCleanup({
  dryRun = asBoolean(process.env.DRY_RUN),
} = {}) {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing in env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const roles = await Role.find().select("_id name visibleMenus visibleMenusConfigured").lean();
    const plan = buildVisibleMenuCleanupPlan(roles);

    printVisibleMenuCleanupPlan(plan, dryRun);

    const changedEntries = plan.filter((entry) => entry.exists && entry.changed);
    const missingRoles = plan.filter((entry) => !entry.exists).map((entry) => entry.roleName);

    console.log(`rolesTargeted: ${plan.length}`);
    console.log(`rolesThatWouldChange: ${changedEntries.length}`);
    console.log(`missingRoles: ${missingRoles.join(", ") || "(none)"}`);
    console.log(`backendSessionsWouldBeCleared: ${!dryRun && changedEntries.length > 0}`);

    if (dryRun) {
      console.log("✅ Phase 2D visible menu dry run complete. No data was modified.");
      return {
        dryRun: true,
        rolesTargeted: plan.length,
        rolesThatWouldChange: changedEntries.length,
        missingRoles,
        modifiedRoles: 0,
        backendSessionsCleared: 0,
      };
    }

    const updateResult = await applyVisibleMenuCleanup(plan);
    let clearedSessions = 0;

    if (updateResult.modifiedRoles > 0) {
      const sessionResult = await clearAdminSessions();
      clearedSessions = sessionResult.clearedSessions;
    }

    console.log(`✅ Roles updated: ${updateResult.modifiedRoles}`);
    console.log(`✅ Admin sessions cleared: ${clearedSessions}`);
    console.log("✅ Phase 2D visible menu cleanup complete");

    return {
      dryRun: false,
      rolesTargeted: plan.length,
      rolesThatWouldChange: changedEntries.length,
      missingRoles,
      modifiedRoles: updateResult.modifiedRoles,
      backendSessionsCleared: clearedSessions,
    };
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRbacPhase2DVisibleMenuCleanup().catch(async (error) => {
    console.error("❌ Phase 2D visible menu cleanup failed:", error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
}
