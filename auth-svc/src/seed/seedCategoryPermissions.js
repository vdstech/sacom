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
    { code: "user:read", description: "View users" },
    { code: "user:write", description: "Create/update users" },
    { code: "user:delete", description: "Delete users" },
    { code: "role:read", description: "View roles" },
    { code: "role:create", description: "Create roles" },
    { code: "role:update", description: "Update roles" },
    { code: "role:delete", description: "Delete roles" },
    { code: "permission:read", description: "View permissions" },
    { code: "permission:create", description: "Create permissions" },
    { code: "permission:update", description: "Update permissions" },
    { code: "permission:delete", description: "Delete permissions" },
    { code: "category:read", description: "View categories" },
    { code: "category:write", description: "Create/update categories" },
    { code: "category:delete", description: "Delete categories" },
    { code: "product:read", description: "View products" },
    { code: "product:write", description: "Create/update products" },
    { code: "product:delete", description: "Delete products" },
    { code: "product:publish", description: "Publish/unpublish products" },
    { code: "inventory:read", description: "View inventory" },
    { code: "inventory:write", description: "Update inventory" },
    { code: "order:read", description: "View orders" },
    { code: "order:write", description: "Create/update orders" },
    { code: "order:delete", description: "Delete/cancel orders" },
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
