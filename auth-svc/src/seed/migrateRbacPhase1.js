import "dotenv/config";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import Permission from "../admin-permissions/admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";
import Session from "../admin-sessions/admin-sessions.model.js";
import { PHASE1_PERMISSION_DEFINITIONS } from "./seedCategoryPermissions.js";

export const ROLE_PERMISSION_ADDITIONS = {
  SUPER_ADMIN: [
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
  ],
  ADMIN: [
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
  ],
  STOREMANAGER: [
    "category:create",
    "category:update",
    "product:create",
    "product:update",
    "product:inventory:update",
    "order:admin",
  ],
  ORDER_MANAGER: [
    "order:admin",
    "order:packaging",
    "order:shipping",
  ],
  PACKAGING_MANAGER: [
    "order:packaging",
  ],
  SHIPPING_MANAGER: [
    "order:shipping",
  ],
  INVENTORY_MANAGER: [
    "product:inventory:update",
  ],
  ORDER_OPERATIONS: [
    "order:admin",
    "order:processing",
    "order:packaging",
    "order:shipping",
    "order:cancellation",
    "product:inventory:update",
  ],
  RETURN_MANAGER: [],
};

export function buildMigratedPermissionCodes(currentCodes = [], additions = []) {
  const nextCodes = new Set(
    currentCodes
      .map((code) => String(code || "").trim())
      .filter(Boolean)
  );

  for (const code of additions) {
    nextCodes.add(code);
  }

  return Array.from(nextCodes).sort();
}

export async function upsertPhase1Permissions() {
  for (const definition of PHASE1_PERMISSION_DEFINITIONS) {
    await Permission.findOneAndUpdate(
      { code: definition.code },
      {
        $set: {
          code: definition.code,
          description: definition.description,
          children: [],
        },
      },
      { new: true, upsert: true }
    );
  }
}

async function buildPermissionIdMap() {
  const permissions = await Permission.find().select("_id code").lean();
  return new Map(permissions.map((permission) => [permission.code, permission._id]));
}

export async function migrateRole(roleName, additions, permissionIdMap) {
  const role = await Role.findOne({ name: roleName });
  if (!role) {
    console.log(`ℹ️ Skipping missing role: ${roleName}`);
    return;
  }

  const currentPermissions = await Permission.find({ _id: { $in: role.permissions || [] } })
    .select("code")
    .lean();
  const currentCodes = currentPermissions
    .map((permission) => String(permission.code || "").trim())
    .filter(Boolean)
    .sort();
  const nextCodes = buildMigratedPermissionCodes(currentCodes, additions);
  const nextPermissionIds = nextCodes
    .map((code) => permissionIdMap.get(code))
    .filter(Boolean);

  role.permissions = nextPermissionIds;
  await role.save();

  console.log(`✅ ${roleName}`);
  console.log(`   before: ${currentCodes.join(", ") || "(none)"}`);
  console.log(`   after:  ${nextCodes.join(", ") || "(none)"}`);
}

export async function invalidateAdminSessions() {
  const result = await Session.deleteMany({});
  console.log(`✅ Cleared admin sessions: ${result.deletedCount || 0}`);
}

export async function runRbacPhase1Migration() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing in env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await upsertPhase1Permissions();
    const permissionIdMap = await buildPermissionIdMap();

    for (const [roleName, additions] of Object.entries(ROLE_PERMISSION_ADDITIONS)) {
      await migrateRole(roleName, additions, permissionIdMap);
    }

    await invalidateAdminSessions();
    console.log("✅ Phase 1 RBAC migration complete");
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRbacPhase1Migration().catch(async (error) => {
    console.error("❌ Phase 1 RBAC migration failed:", error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
}
