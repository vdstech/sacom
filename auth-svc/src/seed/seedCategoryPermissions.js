import Permission from "../admin-permissions/admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";

export const PHASE1_PERMISSION_DEFINITIONS = [
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
  { code: "category:create", description: "Create categories" },
  { code: "category:update", description: "Update categories" },
  { code: "category:delete", description: "Delete categories" },
  { code: "product:read", description: "View products" },
  { code: "product:create", description: "Create products" },
  { code: "product:update", description: "Update products" },
  { code: "product:delete", description: "Delete products" },
  { code: "product:publish", description: "Publish/unpublish products" },
  { code: "inventory:read", description: "View inventory" },
  { code: "product:inventory:update", description: "Update product inventory" },
  { code: "order:read", description: "View orders" },
  { code: "order:admin", description: "Cancel pre-shipment items as an order admin" },
  { code: "order:processing", description: "Manage the processing manager picking queue" },
  { code: "order:packaging", description: "Manage the packaging manager queue and handovers" },
  { code: "order:shipping", description: "Manage the shipping operator queue and shipments" },
  { code: "order:cancellation", description: "Manage cancellation handovers and stock outcomes" },
  { code: "order:return", description: "Manage customer return collection and receipt" },
  { code: "order:override", description: "Override order workflows and route cancellations" },
  { code: "order:cancel", description: "Route manager-triggered cancellations for pre-shipment items" },
  { code: "order:cancel:manage", description: "Receive and validate pre-shipment cancellation items" },
];

export const ACTIVE_PERMISSION_CODES = PHASE1_PERMISSION_DEFINITIONS.map((definition) => definition.code);

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
  const leafPerms = [];
  for (const def of PHASE1_PERMISSION_DEFINITIONS) {
    const p = await upsertPermission({ ...def, children: [] });
    leafPerms.push(p);
  }

  const leafIds = leafPerms.map((p) => p._id);
  await addPermsToRole("SUPER_ADMIN", leafIds);
  await addPermsToRole("ADMIN", leafIds);

  console.log("✅ Category permissions seeded:", PHASE1_PERMISSION_DEFINITIONS.map((x) => x.code));
}
