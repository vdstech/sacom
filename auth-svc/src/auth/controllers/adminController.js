import mongoose from "mongoose";
import Role from "../models/roleModel.js";
import User from "../models/userModel.js";
import { hashPassword } from "../../security/password.js";

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

export const deleteUser = async (req, res) => {
  if (req.user.isSystemUser) {
    return res.status(403).json({ error: "System user cannot be deleted" });
  }

  const user = await User.findByIdAndDelete(req.body.id);
  if (!user) {
    res.status(409).json({ status: "User did not exist" });
  }

  return res.json(user);
};
