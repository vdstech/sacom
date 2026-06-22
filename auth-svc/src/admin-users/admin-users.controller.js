import mongoose from "mongoose";
import Role from "../admin-roles/admin-roles.model.js";
import User from "./admin-users.model.js";
import { hashPassword } from "../security/password.js";
import { recordAuditEvent } from "../audit/audit.service.js";

export const createUser = async (req, res) => {
  const { email, name, roles, password, systemLevel: requestedSystemLevel, isSystemUser: requestedIsSystemUser } =
    req.body;

  console.log("####### req.body:", req.body);
  console.log("####### req.body.roles:", roles);
  try {
    // no-op: casting happens later; this try/catch is just to keep structure clear
  } catch (e) {
    return res.status(400).json({ error: e.message || "Invalid role id" });
  }

  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(409).json({ error: "User with this email already exists" });
  }

  const superAdminRole = await Role.findOne({ name: "SUPER_ADMIN" });
  if (superAdminRole && req.body.roles?.includes(superAdminRole._id.toString())) {
    return res.status(403).json({ error: "SUPER_ADMIN user cannot be created or assigned via API" });
  }

  // Helpful debug: confirm which collection the Role model is reading from
  console.log("####### Role collection:", Role.collection?.name);

  let roleObjectIds;
  try {
    roleObjectIds = (roles || []).map((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid role id: ${id}`);
      }
      return new mongoose.Types.ObjectId(id);
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Invalid role id" });
  }

  const roleDocs = await Role.find({ _id: { $in: roleObjectIds } });
  // validator already checked basic shape; double-check roles actually exist

  console.log("####### roleDocs:", roleDocs);
  console.log("####### roles:", roles);
  if (roleDocs.length !== roles.length) {
    return res.status(400).json({ error: "invalid role(s)" });
  }

  const systemLevels = ["NONE", "ADMIN", "SUPER"];
  const derivedSystemLevel =
    roleDocs
      .map((r) => systemLevels.indexOf(r.systemLevel || "NONE"))
      .filter((idx) => idx >= 0)
      .reduce((max, idx) => Math.max(max, idx), 0) || 0;
  const systemLevel = systemLevels[derivedSystemLevel] || "NONE";
  const isSystemUser = roleDocs.some((r) => r.isSystemRole || r.systemLevel === "ADMIN" || r.systemLevel === "SUPER");

  if (requestedSystemLevel !== undefined || requestedIsSystemUser !== undefined) {
    const allowFlags = isSystemUser;
    const matchesDerived =
      (requestedSystemLevel === undefined || requestedSystemLevel === systemLevel) &&
      (requestedIsSystemUser === undefined || requestedIsSystemUser === isSystemUser);
    if (!allowFlags || !matchesDerived) {
      return res.status(400).json({ error: "system flags can only be set for admin roles" });
    }
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    name,
    roles: roleDocs.map((r) => r._id),
    passwordHash,
    systemLevel,
    isSystemUser,
    // for future: passwordExpiresAt: new Date(Date.now() + N days)
  });

  await recordAuditEvent({
    req,
    action: "USER_CREATED",
    entityType: "USER",
    entityId: String(user._id),
    entityDisplayId: user.email,
    actor: {
      actorType: "USER",
      userId: req.user?._id,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
      roleNames: req.user?.roleNames || [],
    },
    after: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      roles: roleDocs.map((role) => ({ id: String(role._id), name: role.name })),
      systemLevel,
      isSystemUser,
      disabled: !!user.disabled,
      force_reset: !!user.force_reset,
    },
  });

  return res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    roles: roleDocs.map((r) => ({ id: r._id, name: r.name })),
    createdAt: user.createdAt,
  });
};

export const listUsers = async (req, res) => {
  const users = await User.find().sort({ name: 1 }).lean();
  return res.json(users);
};

export const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(user);
};

export const updateUser = async (req, res) => {
  const { name, roles, disabled, force_reset } = req.body;
  const existing = await User.findById(req.params.id).lean();
  if (!existing) return res.status(404).json({ error: "User not found" });

  const patch = {};
  if (name !== undefined) patch.name = String(name).trim();
  if (disabled !== undefined) patch.disabled = !!disabled;
  if (force_reset !== undefined) patch.force_reset = !!force_reset;

  if (roles !== undefined) {
    if (!Array.isArray(roles) || roles.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: "roles must be an array of role ObjectIds" });
    }
    const roleObjectIds = roles.map((id) => new mongoose.Types.ObjectId(id));
    const roleDocs = await Role.find({ _id: { $in: roleObjectIds } });
    if (roleDocs.length !== roles.length) {
      return res.status(400).json({ error: "invalid role(s)" });
    }
    patch.roles = roleDocs.map((r) => r._id);
  }

  const user = await User.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
  if (!user) return res.status(404).json({ error: "User not found" });

  await recordAuditEvent({
    req,
    action: "USER_UPDATED",
    entityType: "USER",
    entityId: String(user._id),
    entityDisplayId: user.email,
    actor: {
      actorType: "USER",
      userId: req.user?._id,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
      roleNames: req.user?.roleNames || [],
    },
    before: {
      name: existing.name,
      roles: existing.roles || [],
      disabled: !!existing.disabled,
      force_reset: !!existing.force_reset,
    },
    after: {
      name: user.name,
      roles: user.roles || [],
      disabled: !!user.disabled,
      force_reset: !!user.force_reset,
    },
  });

  if (existing.disabled !== user.disabled) {
    await recordAuditEvent({
      req,
      action: user.disabled ? "USER_DISABLED" : "USER_ENABLED",
      entityType: "USER",
      entityId: String(user._id),
      entityDisplayId: user.email,
      actor: {
        actorType: "USER",
        userId: req.user?._id,
        email: req.user?.email,
        name: req.user?.name,
        role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
        roleNames: req.user?.roleNames || [],
      },
      before: { disabled: !!existing.disabled },
      after: { disabled: !!user.disabled },
    });
  }

  return res.json(user);
};

export const deleteUser = async (req, res) => {
  const userToDelete = await User.findById(req.params.id);
  if (!userToDelete) return res.status(404).json({ error: "User did not exist" });

  if (userToDelete.isSystemUser) {
    return res.status(403).json({ error: "System user cannot be deleted" });
  }

  const user = await User.findByIdAndDelete(req.params.id);

  await recordAuditEvent({
    req,
    action: "USER_DELETED",
    entityType: "USER",
    entityId: String(user?._id || userToDelete._id),
    entityDisplayId: String(user?.email || userToDelete.email || ""),
    actor: {
      actorType: "USER",
      userId: req.user?._id,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.primaryRole || req.auth?.systemLevel || "ADMIN_USER",
      roleNames: req.user?.roleNames || [],
    },
    before: {
      email: userToDelete.email,
      name: userToDelete.name,
      roles: userToDelete.roles || [],
      disabled: !!userToDelete.disabled,
    },
  });

  return res.json(user);
};
