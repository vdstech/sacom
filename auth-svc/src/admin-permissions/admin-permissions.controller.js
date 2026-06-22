import Permission from "./admin-permissions.model.js";
import Role from "../admin-roles/admin-roles.model.js";
import { recordAuditEvent } from "../audit/audit.service.js";

export function isSuperSystemLevel(req) {
  return String(req.auth?.systemLevel || "NONE").toUpperCase() === "SUPER";
}

function buildActor(req) {
  return {
    actorType: "USER",
    userId: req.user?._id,
    email: req.user?.email,
    name: req.user?.name,
    role: req.user?.primaryRole || req.auth?.systemLevel || "SUPER_ADMIN",
    roleNames: req.user?.roleNames || [],
  };
}

function normalizePermissionCode(value) {
  return String(value ?? "").trim();
}

function normalizeDescription(value) {
  return String(value ?? "").trim();
}

async function findPermissionRoleUsage(permissionId) {
  const roles = await Role.find({ permissions: permissionId })
    .select("_id name isSystemRole systemLevel")
    .lean();
  return roles.map((role) => ({
    id: String(role._id || ""),
    name: String(role.name || "").trim(),
    isSystemRole: !!role.isSystemRole || ["SUPER", "ADMIN"].includes(String(role.systemLevel || "").toUpperCase()),
  }));
}

async function recordPermissionRejection({
  req,
  permission,
  before,
  reason,
  metadata = {},
  action = "PERMISSION_UPDATE_REJECTED",
}) {
  await recordAuditEvent({
    req,
    action,
    entityType: "PERMISSION",
    entityId: String(permission?._id || ""),
    entityDisplayId: String(permission?.code || ""),
    actor: buildActor(req),
    before,
    result: "FAILURE",
    failureReason: reason,
    metadata,
  });
}

export const createPermission = async (req, res) => {
  if (!isSuperSystemLevel(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const code = normalizePermissionCode(req.body?.code);
    const description = normalizeDescription(req.body?.description);
    if (!code) return res.status(400).json({ error: "code is required" });
    if (!description) return res.status(400).json({ error: "description is required" });

    const permission = await Permission.create({
      code,
      description,
      isSystemPermission: false,
      children: Array.isArray(req.body?.children) ? req.body.children : [],
    });
    await recordAuditEvent({
      req,
      action: "PERMISSION_CREATED",
      entityType: "PERMISSION",
      entityId: String(permission._id),
      entityDisplayId: permission.code,
      actor: buildActor(req),
      after: permission.toObject ? permission.toObject() : permission,
    });
    res.status(201).json({ permission });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: "Permission code already exists" });
    res.status(400).json({ error: e.message });
  }
};

export const listPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find().sort({ code: 1 });
    res.status(200).json({ permissions });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const updatePermissions = async (req, res) => {
  if (!isSuperSystemLevel(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const permissionId = String(req.body?.id || "").trim();
    if (!permissionId) {
      return res.status(400).json({ error: "Permission id is required" });
    }

    const permission = await Permission.findById(permissionId);
    if (!permission) {
      return res.status(404).json({ error: "Permission not found" });
    }

    const before = permission.toObject ? permission.toObject() : { ...permission };
    const nextDescription = normalizeDescription(req.body?.description ?? permission.description);
    const requestedCode = normalizePermissionCode(req.body?.code ?? permission.code);
    const requestedCodeChanged = requestedCode !== permission.code;
    const roleUsage = await findPermissionRoleUsage(permission._id);
    const usedBySystemRoles = roleUsage.filter((role) => role.isSystemRole);

    if (!nextDescription) {
      return res.status(400).json({ error: "description is required" });
    }

    if (!requestedCode) {
      return res.status(400).json({ error: "code is required" });
    }

    if (permission.isSystemPermission && requestedCodeChanged) {
      await recordPermissionRejection({
        req,
        permission,
        before,
        reason: "System permission codes cannot be renamed",
        metadata: { requestedCode },
      });
      return res.status(409).json({ error: "System permission codes cannot be renamed" });
    }

    if (!permission.isSystemPermission && requestedCodeChanged && roleUsage.length) {
      const roleNames = roleUsage.map((role) => role.name);
      const reason = usedBySystemRoles.length
        ? "Permissions assigned to system roles cannot be renamed"
        : "Permissions assigned to roles cannot be renamed";
      await recordPermissionRejection({
        req,
        permission,
        before,
        reason,
        metadata: {
          requestedCode,
          roleNames,
          systemRoleNames: usedBySystemRoles.map((role) => role.name),
        },
      });
      return res.status(409).json({
        error: usedBySystemRoles.length
          ? "This permission is assigned to system roles and cannot be renamed."
          : "Remove this permission from assigned roles before renaming it.",
      });
    }

    if (requestedCodeChanged) {
      const duplicate = await Permission.findOne({ code: requestedCode, _id: { $ne: permission._id } })
        .select("_id")
        .lean();
      if (duplicate) {
        await recordPermissionRejection({
          req,
          permission,
          before,
          reason: "Permission code already exists",
          metadata: { requestedCode },
        });
        return res.status(409).json({ error: "Permission code already exists" });
      }
    }

    permission.description = nextDescription;
    if (!permission.isSystemPermission && requestedCodeChanged) {
      permission.code = requestedCode;
    }
    await permission.save();

    await recordAuditEvent({
      req,
      action: "PERMISSION_UPDATED",
      entityType: "PERMISSION",
      entityId: String(permission._id),
      entityDisplayId: permission.code,
      actor: buildActor(req),
      before,
      after: permission.toObject ? permission.toObject() : permission,
      metadata: {
        codeChanged: requestedCodeChanged,
        systemProtected: !!permission.isSystemPermission,
      },
    });

    res.status(200).json({ permission });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const deletePermission = async (req, res) => {
  if (!isSuperSystemLevel(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const permission = await Permission.findById(req.params.id);
    if (!permission) {
      return res.status(200).json({ permission: null });
    }
    if (permission.isSystemPermission) {
      await recordPermissionRejection({
        req,
        permission,
        before: permission.toObject ? permission.toObject() : permission,
        reason: "System permissions cannot be deleted",
        action: "PERMISSION_DELETE_REJECTED",
      });
      return res.status(409).json({ error: "System permissions cannot be deleted" });
    }

    const roleUsage = await findPermissionRoleUsage(permission._id);
    if (roleUsage.length > 0) {
      await recordPermissionRejection({
        req,
        permission,
        before: permission.toObject ? permission.toObject() : permission,
        reason: "Permission is still assigned to roles",
        action: "PERMISSION_DELETE_REJECTED",
        metadata: {
          roleNames: roleUsage.map((role) => role.name),
          systemRoleNames: roleUsage.filter((role) => role.isSystemRole).map((role) => role.name),
        },
      });
      return res.status(409).json({ error: "Remove this permission from roles before deleting it" });
    }

    await Permission.deleteOne({ _id: permission._id });
    if (permission) {
      await recordAuditEvent({
        req,
        action: "PERMISSION_DELETED",
        entityType: "PERMISSION",
        entityId: String(permission._id),
        entityDisplayId: permission.code,
        actor: buildActor(req),
        before: permission.toObject ? permission.toObject() : permission,
      });
    }
    res.status(200).json({ permission });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
