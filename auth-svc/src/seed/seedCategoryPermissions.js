import Permission from "../auth/models/permissionModel.js";
import Role from "../auth/models/roleModel.js";

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

export async function seedCategoryPermissions() {
  const leafDefs = [
    { code: "nav:read", description: "View nav list/tree/details" },
    { code: "nav:write", description: "Create/update nav" },
    { code: "nav:delete", description: "Delete nav" },
    { code: "nav:publish", description: "Enable/disable nav" },
    { code: "nav:reorder", description: "Move/reorder in nav tree" },
  ];

  const leafPerms = [];
  for (const def of leafDefs) {
    const p = await upsertPermission({ ...def, children: [] });
    leafPerms.push(p);
  }

  const groupPerm = await upsertPermission({
    code: "nav:all",
    description: "All nav permissions",
    children: leafPerms.map((p) => p._id),
  });

  await Permission.updateOne(
    { _id: groupPerm._id },
    { $set: { children: leafPerms.map((p) => p._id) } }
  );

  const leafIds = leafPerms.map((p) => p._id);
  await addPermsToRole("SUPER_ADMIN", leafIds);
  await addPermsToRole("ADMIN", leafIds);

  console.log("✅ Category permissions seeded:", leafDefs.map((x) => x.code));
}