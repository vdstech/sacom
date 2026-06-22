import Role from "./admin-roles.model.js";
import Permission from "../admin-permissions/admin-permissions.model.js";
import { normalizeVisibleMenus } from "./admin-menu-catalog.js";
import { recordAuditEvent } from "../audit/audit.service.js";

function normalizeRoleName(name) {
  return String(name || "").trim().toUpperCase();
}

function isAdminRoleName(name) {
  return normalizeRoleName(name) === "ADMIN";
}

function mapRole(role) {
  const doc = typeof role?.toObject === "function" ? role.toObject() : role;
  return {
    ...doc,
    visibleMenusConfigured: !!doc?.visibleMenusConfigured,
    visibleMenus: normalizeVisibleMenus(doc?.visibleMenus || []),
  };
}

async function recordRoleRejection({
  req,
  role = null,
  roleName = "",
  reason,
  before = undefined,
  metadata = {},
  action = "ROLE_UPDATE_REJECTED",
}) {
  await recordAuditEvent({
    req,
    action,
    entityType: "ROLE",
    entityId: String(role?._id || ""),
    entityDisplayId: String(role?.name || roleName || ""),
    actor: {
      actorType: "USER",
      userId: req.user?._id,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
      roleNames: req.user?.roleNames || [],
    },
    before,
    result: "FAILURE",
    failureReason: reason,
    metadata,
  });
}

async function resolveRolePermissionIds(permissions) {
  if (permissions === undefined) return null;
  if (!Array.isArray(permissions)) {
    const error = new Error("permissions must be an array");
    error.statusCode = 400;
    throw error;
  }

  const uniquePermissionIds = Array.from(new Set(permissions.map((permissionId) => String(permissionId || "").trim()).filter(Boolean)));
  if (!uniquePermissionIds.length) return [];

  const permissionDocs = await Permission.find({ _id: { $in: uniquePermissionIds } })
    .select("_id")
    .lean();
  if (permissionDocs.length !== uniquePermissionIds.length) {
    const existingIds = new Set(permissionDocs.map((permission) => String(permission._id)));
    const missingPermissionIds = uniquePermissionIds.filter((permissionId) => !existingIds.has(permissionId));
    const error = new Error(`invalid permission(s): ${missingPermissionIds.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  return permissionDocs.map((permission) => permission._id);
}

export const createRole = async (req, res) => {
  const { name, permissions, description, visibleMenus, visibleMenusConfigured } = req.body;
  try {
    const roleName = normalizeRoleName(name);
    if (!roleName) {
      return res.status(400).json({ error: "Role name is required" });
    }

    if (req.auth?.systemLevel === "ADMIN" && isAdminRoleName(roleName)) {
      await recordRoleRejection({
        req,
        roleName,
        reason: "ADMIN users cannot create the ADMIN role",
        action: "ROLE_CREATE_REJECTED",
      });
      return res.status(403).json({ error: "Forbidden" });
    }

    const exists = await Role.findOne({ name: roleName }).select("_id").lean();
    if (exists) {
      await recordRoleRejection({
        req,
        roleName,
        reason: "Role already exists",
        action: "ROLE_CREATE_REJECTED",
      });
      return res.status(409).json({ error: "Role already exists" });
    }

    const resolvedPermissionIds = await resolveRolePermissionIds(permissions);
    const role = await Role.create({
      name: roleName,
      permissions: resolvedPermissionIds || [],
      description: description || "",
      visibleMenusConfigured: !!visibleMenusConfigured,
      visibleMenus: visibleMenusConfigured ? normalizeVisibleMenus(visibleMenus) : [],
    });

    await recordAuditEvent({
      req,
      action: "ROLE_CREATED",
      entityType: "ROLE",
      entityId: String(role._id),
      entityDisplayId: role.name,
      actor: {
        actorType: "USER",
        userId: req.user?._id,
        email: req.user?.email,
        name: req.user?.name,
        role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
        roleNames: req.user?.roleNames || [],
      },
      after: mapRole(role),
    });

    return res.status(201).json(mapRole(role));
  } catch (error) {
    await recordRoleRejection({
      req,
      roleName: normalizeRoleName(name),
      reason: error.message || "Failed to create role",
      metadata: {
        requestedPermissions: Array.isArray(permissions) ? permissions : [],
      },
      action: "ROLE_CREATE_REJECTED",
    });
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to create role" });
  }
};

export const listRoles = async (req, res) => {
  const roles = await Role.find().sort({ name: 1 }).lean();
  return res.json(roles.map(mapRole));
};

export const updateRole = async (req, res) => {
  const { name, permissions, description, visibleMenus, visibleMenusConfigured } = req.body;
  const id = req.params.id || req.body.id;

  if (!id) {
    return res.status(400).json({ error: "id is required" });
  }

  const role = await Role.findById(id);
  if (!role) {
    return res.status(404).json({ error: "Role does not exist" });
  }
  const before = mapRole(role);

  // Rule: ADMIN user cannot update the ADMIN role
  if (req.auth?.systemLevel === "ADMIN" && isAdminRoleName(role.name)) {
    await recordRoleRejection({
      req,
      role,
      before,
      reason: "ADMIN users cannot update the ADMIN role",
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  // Keep existing protection: system roles cannot be modified by non-SUPER (optional)
  // If you want stricter rules later, add checks here.

  if (name !== undefined) {
    const roleName = normalizeRoleName(name);
    if (!roleName) {
      await recordRoleRejection({
        req,
        role,
        before,
        reason: "Role name cannot be empty",
      });
      return res.status(400).json({ error: "Role name cannot be empty" });
    }

    // ADMIN cannot rename any role to ADMIN either
    if (req.auth?.systemLevel === "ADMIN" && isAdminRoleName(roleName)) {
      await recordRoleRejection({
        req,
        role,
        before,
        reason: "ADMIN users cannot rename a role to ADMIN",
        metadata: { requestedName: roleName },
      });
      return res.status(403).json({ error: "Forbidden" });
    }

    // Prevent duplicates on rename
    const exists = await Role.findOne({ name: roleName, _id: { $ne: role._id } })
      .select("_id")
      .lean();
    if (exists) {
      await recordRoleRejection({
        req,
        role,
        before,
        reason: "Role already exists",
        metadata: { requestedName: roleName },
      });
      return res.status(409).json({ error: "Role already exists" });
    }

    role.name = roleName;
  }

  if (permissions !== undefined) {
    try {
      role.permissions = await resolveRolePermissionIds(permissions);
    } catch (error) {
      await recordRoleRejection({
        req,
        role,
        before,
        reason: error.message || "Failed to validate permissions",
        metadata: {
          requestedPermissions: Array.isArray(permissions) ? permissions : [],
        },
      });
      return res.status(error.statusCode || 500).json({ error: error.message || "Failed to validate permissions" });
    }
  }

  if (visibleMenusConfigured !== undefined) {
    role.visibleMenusConfigured = !!visibleMenusConfigured;
    if (!role.visibleMenusConfigured) {
      role.visibleMenus = [];
    } else if (visibleMenus === undefined) {
      role.visibleMenus = normalizeVisibleMenus(role.visibleMenus || []);
    }
  }

  if (visibleMenus !== undefined) {
    if (!Array.isArray(visibleMenus)) {
      return res.status(400).json({ error: "visibleMenus must be an array" });
    }
    role.visibleMenus = role.visibleMenusConfigured ? normalizeVisibleMenus(visibleMenus) : [];
  }

  if (description !== undefined) {
    role.description = description || "";
  }

  await role.save();
  const after = mapRole(role);
  const beforePermissionIds = new Set((before.permissions || []).map(String));
  const afterPermissionIds = new Set((after.permissions || []).map(String));
  const permissionsAdded = Array.from(afterPermissionIds).filter((value) => !beforePermissionIds.has(value));
  const permissionsRemoved = Array.from(beforePermissionIds).filter((value) => !afterPermissionIds.has(value));

  await recordAuditEvent({
    req,
    action: "ROLE_UPDATED",
    entityType: "ROLE",
    entityId: String(role._id),
    entityDisplayId: role.name,
    actor: {
      actorType: "USER",
      userId: req.user?._id,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
      roleNames: req.user?.roleNames || [],
    },
    before,
    after,
    metadata: {
      permissionsAdded,
      permissionsRemoved,
    },
  });

  if (permissionsAdded.length || permissionsRemoved.length) {
    await recordAuditEvent({
      req,
      action: "ROLE_PERMISSIONS_UPDATED",
      entityType: "ROLE",
      entityId: String(role._id),
      entityDisplayId: role.name,
      actor: {
        actorType: "USER",
        userId: req.user?._id,
        email: req.user?.email,
        name: req.user?.name,
        role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
        roleNames: req.user?.roleNames || [],
      },
      before: { permissions: before.permissions || [] },
      after: { permissions: after.permissions || [] },
      metadata: {
        permissionsAdded,
        permissionsRemoved,
      },
    });
  }

  return res.json(mapRole(role));
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
    await recordRoleRejection({
      req,
      role,
      before: mapRole(role),
      reason: "System roles cannot be deleted",
      action: "ROLE_DELETE_REJECTED",
    });
    return res.status(403).json({ error: "System roles cannot be deleted" });
  }

  // Rule: ADMIN user cannot delete the ADMIN role
  if (req.auth?.systemLevel === "ADMIN" && isAdminRoleName(role.name)) {
    await recordRoleRejection({
      req,
      role,
      before: mapRole(role),
      reason: "ADMIN users cannot delete the ADMIN role",
      action: "ROLE_DELETE_REJECTED",
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  const deletedRole = await Role.findByIdAndDelete(id);
  await recordAuditEvent({
    req,
    action: "ROLE_DELETED",
    entityType: "ROLE",
    entityId: String(deletedRole?._id || role._id),
    entityDisplayId: String(deletedRole?.name || role.name || ""),
    actor: {
      actorType: "USER",
      userId: req.user?._id,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
      roleNames: req.user?.roleNames || [],
    },
    before: mapRole(role),
  });
  return res.json(deletedRole);
};
