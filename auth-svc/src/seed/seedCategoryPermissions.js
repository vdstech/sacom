const PermissionModule = require("../auth/models/permissionModel.js");
const RoleModule = require("../auth/models/roleModel.js");

const Permission = PermissionModule.default || PermissionModule;
const Role = RoleModule.default || RoleModule;

async function upsertPermission(doc) {
  return Permission.findOneAndUpdate(
    { code: doc.code },
    { $set: { code: doc.code, description: doc.description, children: doc.children || [] } },
    { new: true, upsert: true }
  );
}

async function addPermsToRole(roleName, permIds) {
  const role = await Role.findOne({ name: roleName });
  if (!role) return;

  const existing = new Set((role.permissions || []).map(String));
  for (const id of permIds) existing.add(String(id));

  role.permissions = Array.from(existing);
  await role.save();
}

async function seedCategoryPermissions() {
  const leafDefs = [
    { code: "category:read", description: "View category list/tree/details" },
    { code: "category:write", description: "Create/update categories" },
    { code: "category:delete", description: "Delete categories" },
    { code: "category:publish", description: "Enable/disable categories" },
    { code: "category:reorder", description: "Move/reorder in category tree" },
  ];

  const leafPerms = [];
  for (const def of leafDefs) {
    const p = await upsertPermission({ ...def, children: [] });
    leafPerms.push(p);
  }

  const groupPerm = await upsertPermission({
    code: "category",
    description: "All category permissions",
    children: leafPerms.map((p) => p._id),
  });

  // keep children synced
  await Permission.updateOne(
    { _id: groupPerm._id },
    { $set: { children: leafPerms.map((p) => p._id) } }
  );

  // grant to roles
  const leafIds = leafPerms.map((p) => p._id);
  await addPermsToRole("SUPER_ADMIN", leafIds);
  await addPermsToRole("ADMIN", leafIds);

  console.log("✅ Category permissions seeded:", leafDefs.map((x) => x.code));
}

module.exports = { seedCategoryPermissions };
