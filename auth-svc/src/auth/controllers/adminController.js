import Role from "../models/roleModel.js";
import User from "../models/userModel.js";
import { hashPassword } from "../../security/password.js";

export const createUser = async (req, res) => {
  const { email, name, roles, password } = req.body;

  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(409).json({ error: "User with this email already exists" });
  }

  const superAdminRole = await Role.findOne({ name: "SUPER_ADMIN" });
  if (superAdminRole && req.body.roles?.includes(superAdminRole._id.toString())) {
    return res.status(403).json({ error: "SUPER_ADMIN user cannot be created or assigned via API" });
  }

  const roleDocs = await Role.find({ _id: { $in: roles } });
  // validator already checked basic shape; double-check roles actually exist
  if (roleDocs.length !== roles.length) {
    return res.status(400).json({ error: "invalid role(s)" });
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    name,
    roles: roleDocs.map((r) => r._id),
    passwordHash,
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
