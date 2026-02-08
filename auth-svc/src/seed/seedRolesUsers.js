import Permission from "../auth/models/permissionModel.js";
import Role from "../auth/models/roleModel.js";
import User from "../auth/models/userModel.js";
import { hashPassword } from "../security/password.js";

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

export async function seedRoleUsers() {
  const permissions = await Permission.find().select("_id").lean();
  const permIds = permissions.map((p) => p._id);

  const roleDefs = [
    {
      name: "SUPER_ADMIN",
      description: "System super administrator",
      permissions: permIds,
      isSystemRole: true,
      systemLevel: "SUPER",
      disabled: false
    },
    {
      name: "ADMIN",
      description: "System administrator",
      permissions: permIds,
      isSystemRole: true,
      systemLevel: "ADMIN",
      disabled: false
    },
  ];

  for (const def of roleDefs) {
    await upsertRole(def);
  }

  const superRole = await ensureSingleRole("SUPER_ADMIN");
  const adminRole = await ensureSingleRole("ADMIN");
  if (!superRole || !adminRole) throw new Error("Role seeding failed: SUPER_ADMIN or ADMIN role missing.");

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
