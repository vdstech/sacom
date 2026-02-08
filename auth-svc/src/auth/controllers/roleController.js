import Role from "../models/roleModel.js";

function normalizeRoleName(name) {
  return String(name || "").trim().toUpperCase();
}

function isAdminRoleName(name) {
  return normalizeRoleName(name) === "ADMIN";
}

export const createRole = async (req, res) => {
  const { name, permissions, description } = req.body;

  const roleName = normalizeRoleName(name);
  if (!roleName) {
    return res.status(400).json({ error: "Role name is required" });
  }

  // Rule: ADMIN user cannot create the ADMIN role (other roles are allowed)
  if (req.auth?.systemLevel === "ADMIN" && isAdminRoleName(roleName)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (permissions !== undefined && !Array.isArray(permissions)) {
    return res.status(400).json({ error: "permissions must be an array" });
  }

  const exists = await Role.findOne({ name: roleName }).select("_id").lean();
  if (exists) {
    return res.status(409).json({ error: "Role already exists" });
  }

  const role = await Role.create({
    name: roleName,
    permissions: Array.isArray(permissions) ? permissions : [],
    description: description || "",
  });

  return res.status(201).json(role);
};

export const listRoles = async (req, res) => {
  const roles = await Role.find().sort({ name: 1 }).lean();
  return res.json(roles);
};

export const updateRole = async (req, res) => {
  const { name, permissions, description } = req.body;
  const id = req.params.id || req.body.id;

  if (!id) {
    return res.status(400).json({ error: "id is required" });
  }

  const role = await Role.findById(id);
  if (!role) {
    return res.status(404).json({ error: "Role does not exist" });
  }

  // Rule: ADMIN user cannot update the ADMIN role
  if (req.auth?.systemLevel === "ADMIN" && isAdminRoleName(role.name)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Keep existing protection: system roles cannot be modified by non-SUPER (optional)
  // If you want stricter rules later, add checks here.

  if (name !== undefined) {
    const roleName = normalizeRoleName(name);
    if (!roleName) {
      return res.status(400).json({ error: "Role name cannot be empty" });
    }

    // ADMIN cannot rename any role to ADMIN either
    if (req.auth?.systemLevel === "ADMIN" && isAdminRoleName(roleName)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Prevent duplicates on rename
    const exists = await Role.findOne({ name: roleName, _id: { $ne: role._id } })
      .select("_id")
      .lean();
    if (exists) {
      return res.status(409).json({ error: "Role already exists" });
    }

    role.name = roleName;
  }

  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: "permissions must be an array" });
    }
    role.permissions = permissions;
  }

  if (description !== undefined) {
    role.description = description || "";
  }

  await role.save();
  return res.json(role);
};

export const deleteRole = async (req, res) => {
  const id = req.params.id || req.body.id;
  if (!id) {
    return res.status(400).json({ error: "id is required" });
  }

  const role = await Role.findById(id);
  if (!role) {
    return res.status(404).json({ error: "Role does not exist" });
  }

  // Keep your existing protection
  if (role.isSystemRole) {
    return res.status(403).json({ error: "System roles cannot be deleted" });
  }

  // Rule: ADMIN user cannot delete the ADMIN role
  if (req.auth?.systemLevel === "ADMIN" && isAdminRoleName(role.name)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const deletedRole = await Role.findByIdAndDelete(id);
  return res.json(deletedRole);
};
