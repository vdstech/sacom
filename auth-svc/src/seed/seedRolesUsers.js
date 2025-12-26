const PermissionModule = require("../auth/models/permissionModel.js");
const RoleModule = require("../auth/models/roleModel.js");
const UserModule = require("../auth/models/userModel.js");
const PasswordModule = require("../security/password.js");

const Permission = PermissionModule.default || PermissionModule;
const Role = RoleModule.default || RoleModule;
const User = UserModule.default || UserModule;
const hashPassword = PasswordModule.hashPassword || (PasswordModule.default && PasswordModule.default.hashPassword);

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

async function setUserPassword(user, plainPassword) {
  const schema = user.schema || User.schema;
  const hasPasswordHash = !!(schema && schema.path && schema.path("passwordHash"));
  const hasPassword = !!(schema && schema.path && schema.path("password"));

  // Prefer passwordHash if present (your earlier docs showed argon2id hashes)
  if (hasPasswordHash) {
    if (!hashPassword) {
      throw new Error("hashPassword not available from security/password.js");
    }
    user.passwordHash = await hashPassword(plainPassword);
    return;
  }

  // If schema uses `password` and has pre-save hashing hook, this will work
  if (hasPassword) {
    user.password = plainPassword;
    return;
  }

  // If your schema has a method like setPassword()
  if (typeof user.setPassword === "function") {
    await user.setPassword(plainPassword);
    return;
  }

  throw new Error("Cannot set password: no passwordHash/password field or setPassword() method found on User model.");
}

async function seedRoleUsers() {
  // 1) permissions -> roles
  const permissions = await Permission.find().select("_id").lean();
  const permIds = permissions.map((p) => p._id);

  const roleDefs = [
    {
      name: "SUPER_ADMIN",
      description: "System super administrator",
      permissions: permIds,
      isSystemRole: true,
      systemLevel: "SUPER",
    },
    {
      name: "ADMIN",
      description: "System administrator",
      permissions: permIds,
      isSystemRole: true,
      systemLevel: "ADMIN",
    },
  ];

  for (const def of roleDefs) {
    await upsertRole(def);
  }

  // Enforce "only one role of each"
  const superRole = await ensureSingleRole("SUPER_ADMIN");
  const adminRole = await ensureSingleRole("ADMIN");
  if (!superRole || !adminRole) throw new Error("Role seeding failed: SUPER_ADMIN or ADMIN role missing.");

  if (permIds.length === 0) {
    console.warn("⚠️ No permissions found; roles created without permissions");
  }
  console.log("✅ Roles seeded:", roleDefs.map((r) => r.name));

  // 2) seed super admin user (only one)
  const SUPER_EMAIL = "superadmin@sa.com";
  const SUPER_PASSWORD = "SuperAdmin@123";

  // Find by email (idempotent)
  let superUser = await User.findOne({ email: SUPER_EMAIL });

  if (!superUser) {
    superUser = new User({
      email: SUPER_EMAIL,
      name: "Super Admin",
      disabled: false,
      force_reset: false,

      // use whichever fields exist in your schema
      isSystemUser: true,
      systemLevel: "SUPER",

      // assuming roles is [ObjectId]
      roles: [superRole._id],
    });

    await setUserPassword(superUser, SUPER_PASSWORD);
    await superUser.save();

    console.log(`✅ Super admin user created: ${SUPER_EMAIL}`);
  } else {
    // ensure it has SUPER role (don’t rotate password on every seed run)
    const rolesArr = Array.isArray(superUser.roles) ? superUser.roles.map(String) : [];
    if (!rolesArr.includes(String(superRole._id))) {
      superUser.roles = [...(superUser.roles || []), superRole._id];
    }

    // keep these consistent if fields exist
    if (superUser.disabled !== undefined) superUser.disabled = false;
    if (superUser.force_reset !== undefined) superUser.force_reset = false;
    if (superUser.isSystemUser !== undefined) superUser.isSystemUser = true;
    if (superUser.systemLevel !== undefined) superUser.systemLevel = "SUPER";

    await superUser.save();
    console.log(`✅ Super admin user ensured: ${SUPER_EMAIL}`);
  }

  // 3) Enforce "only one super admin user"
  // Prefer role-based check; fallback to systemLevel/email if that’s what you use
  const countByRole = await User.countDocuments({ roles: superRole._id });
  const countByLevel = await User.countDocuments({ systemLevel: "SUPER" });
  const countByEmail = await User.countDocuments({ email: SUPER_EMAIL });

  // If any of these indicates more than one, fail loudly
  if (countByRole > 1 || countByLevel > 1 || countByEmail > 1) {
    throw new Error(
      `More than one SUPER admin detected. counts => byRole:${countByRole}, bySystemLevel:${countByLevel}, byEmail:${countByEmail}. Please keep only one.`
    );
  }
}

module.exports = { seedRoleUsers };
