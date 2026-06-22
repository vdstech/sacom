import Permission from "../admin-permissions/admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";
import { ADMIN_MENU_IDS } from "../admin-roles/admin-menu-catalog.js";
import User from "../admin-users/admin-users.model.js";
import { hashPassword } from "../security/password.js";
import { ACTIVE_PERMISSION_CODES } from "./seedCategoryPermissions.js";

async function upsertRole(doc) {
  return Role.findOneAndUpdate(
    { name: doc.name },
    { $set: doc },
    { new: true, upsert: true }
  );
}

async function ensureSingleRole(name) {
  const roles = await Role.find({ name }).select("_id name").lean();
  if (roles.length > 1) {
    throw new Error(`Duplicate role detected for "${name}". Found ${roles.length} roles: ${roles.map(r => r._id).join(", ")}`);
  }
  return roles[0] || null;
}

export const ROLE_PERMISSION_CODES = {
  SUPER_ADMIN: ACTIVE_PERMISSION_CODES,
  ADMIN: ACTIVE_PERMISSION_CODES,
  ORDER_ADMIN: ["order:read", "order:admin", "order:dashboard:fulfillment:read", "order:dashboard:escalations:read"],
  PROCESSING_MANAGER: ["order:read", "order:processing"],
  PACKAGING_MANAGER: ["order:read", "order:packaging"],
  SHIPPING_OPERATOR: ["order:read", "order:shipping"],
  CANCELLATION_MANAGER: ["order:read", "order:cancellation"],
  RETURN_EXCHANGE_HANDLER: ["order:read", "order:return"],
  INVENTORY_MANAGER: ["order:read", "inventory:read", "product:inventory:update"],
};

export async function seedRoleUsers() {
  const permissions = await Permission.find().select("_id code").lean();
  const getPermIds = (codes) => permissions
    .filter((permission) => codes.includes(permission.code))
    .map((permission) => permission._id);
  const orderAdminMenus = ["ordersDashboard", "ordersMetrics", "orders"];
  const processingManagerMenus = ["ordersDashboard", "processingManager", "orders"];
  const packagingManagerMenus = ["ordersDashboard", "packagingManager", "orders"];
  const shippingOperatorMenus = ["ordersDashboard", "shippingOperator", "orders"];
  const cancellationManagerMenus = ["ordersDashboard", "cancellationManager", "orders"];
  const returnExchangeManagerMenus = ["ordersDashboard", "returnExchangeManager", "orders"];
  const inventoryManagerMenus = ["inventory"];

  const roleDefs = [
    {
      name: "SUPER_ADMIN",
      description: "System super administrator",
      permissions: getPermIds(ROLE_PERMISSION_CODES.SUPER_ADMIN),
      visibleMenus: ADMIN_MENU_IDS,
      visibleMenusConfigured: false,
      isSystemRole: true,
      systemLevel: "SUPER",
      disabled: false
    },
    {
      name: "ADMIN",
      description: "System administrator",
      permissions: getPermIds(ROLE_PERMISSION_CODES.ADMIN),
      visibleMenus: ADMIN_MENU_IDS,
      visibleMenusConfigured: false,
      isSystemRole: true,
      systemLevel: "ADMIN",
      disabled: false
    },
    {
      name: "ORDER_ADMIN",
      description: "Supervisory order administrator for pre-shipment cancellation and oversight",
      permissions: getPermIds(ROLE_PERMISSION_CODES.ORDER_ADMIN),
      visibleMenus: orderAdminMenus,
      visibleMenusConfigured: true,
      isSystemRole: false,
      systemLevel: "NONE",
      disabled: false
    },
    {
      name: "PROCESSING_MANAGER",
      description: "Picks reserved items and hands them to packaging",
      permissions: getPermIds(ROLE_PERMISSION_CODES.PROCESSING_MANAGER),
      visibleMenus: processingManagerMenus,
      visibleMenusConfigured: true,
      isSystemRole: false,
      systemLevel: "NONE",
      disabled: false
    },
    {
      name: "PACKAGING_MANAGER",
      description: "Receives, packs, labels, and hands items to shipping",
      permissions: getPermIds(ROLE_PERMISSION_CODES.PACKAGING_MANAGER),
      visibleMenus: ["packagingManager"],
      visibleMenusConfigured: true,
      isSystemRole: false,
      systemLevel: "NONE",
      disabled: false
    },
    {
      name: "SHIPPING_OPERATOR",
      description: "Receives packed items, assigns courier and tracking, and ships them",
      permissions: getPermIds(ROLE_PERMISSION_CODES.SHIPPING_OPERATOR),
      visibleMenus: ["shippingOperator"],
      visibleMenusConfigured: true,
      isSystemRole: false,
      systemLevel: "NONE",
      disabled: false
    },
    {
      name: "CANCELLATION_MANAGER",
      description: "Receives cancelled items and decides restock, damaged, or lost outcomes",
      permissions: getPermIds(ROLE_PERMISSION_CODES.CANCELLATION_MANAGER),
      visibleMenus: ["cancellationManager"],
      visibleMenusConfigured: true,
      isSystemRole: false,
      systemLevel: "NONE",
      disabled: false
    },
    {
      name: "RETURN_EXCHANGE_HANDLER",
      description: "Investigates customer return and exchange cases and updates their lifecycle",
      permissions: getPermIds(ROLE_PERMISSION_CODES.RETURN_EXCHANGE_HANDLER),
      visibleMenus: ["returnExchangeManager"],
      visibleMenusConfigured: true,
      isSystemRole: false,
      systemLevel: "NONE",
      disabled: false
    },
    {
      name: "INVENTORY_MANAGER",
      description: "Restocks returned and cancelled items in inventory",
      permissions: getPermIds(ROLE_PERMISSION_CODES.INVENTORY_MANAGER),
      visibleMenus: inventoryManagerMenus,
      visibleMenusConfigured: true,
      isSystemRole: false,
      systemLevel: "NONE",
      disabled: false
    },
  ];

  for (const def of roleDefs) {
    await upsertRole(def);
  }

  const superRole = await ensureSingleRole("SUPER_ADMIN");
  const adminRole = await ensureSingleRole("ADMIN");
  const requiredRoles = [
    await ensureSingleRole("ORDER_ADMIN"),
    await ensureSingleRole("PROCESSING_MANAGER"),
    await ensureSingleRole("PACKAGING_MANAGER"),
    await ensureSingleRole("SHIPPING_OPERATOR"),
    await ensureSingleRole("CANCELLATION_MANAGER"),
    await ensureSingleRole("RETURN_EXCHANGE_HANDLER"),
    await ensureSingleRole("INVENTORY_MANAGER"),
  ];
  if (!superRole || !adminRole || requiredRoles.some((role) => !role)) {
    throw new Error("Role seeding failed: one or more system roles were not created.");
  }

  console.log("✅ Roles seeded:", roleDefs.map((r) => r.name));

  const SUPER_EMAIL = process.env.SUPER_ADMIN_EMAIL || "superadmin@sa.com";
  const SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin@123";

  let superUser = await User.findOne({ email: SUPER_EMAIL });

  if (!superUser) {
    superUser = new User({
      email: SUPER_EMAIL,
      name: "Super Admin",
      disabled: false,
      force_reset: false,
      isSystemUser: true,
      // NOTE: you will add systemLevel to schema in next step
      systemLevel: "SUPER",
      roles: [superRole._id],
      passwordHash: await hashPassword(SUPER_PASSWORD),
    });

    await superUser.save();
    console.log(`✅ Super admin user created: ${SUPER_EMAIL}`);
  } else {
    const rolesArr = Array.isArray(superUser.roles) ? superUser.roles.map(String) : [];
    if (!rolesArr.includes(String(superRole._id))) {
      superUser.roles = [...(superUser.roles || []), superRole._id];
    }
    if (superUser.disabled !== undefined) superUser.disabled = false;
    if (superUser.force_reset !== undefined) superUser.force_reset = false;
    if (superUser.isSystemUser !== undefined) superUser.isSystemUser = true;
    if (superUser.systemLevel !== undefined) superUser.systemLevel = "SUPER";
    // Keep seed deterministic so login credentials are always valid after re-seed.
    superUser.passwordHash = await hashPassword(SUPER_PASSWORD);

    await superUser.save();
    console.log(`✅ Super admin user ensured (password reset to seed value): ${SUPER_EMAIL}`);
  }

  const countByRole = await User.countDocuments({ roles: superRole._id });
  const countByLevel = await User.countDocuments({ systemLevel: "SUPER" });
  const countByEmail = await User.countDocuments({ email: SUPER_EMAIL });

  if (countByRole > 1 || countByLevel > 1 || countByEmail > 1) {
    throw new Error(
      `More than one SUPER admin detected. counts => byRole:${countByRole}, bySystemLevel:${countByLevel}, byEmail:${countByEmail}.`
    );
  }
}
