import Role from "../models/roleModel.js";

export const createRole = async (req, res) => {
  const { name, permissions, description } = req.body;

  const exists = await Role.findOne({ name });
  if (exists) {
    return res.status(409).json({
      error: "Role already exists",
    });
  }

  const role = await Role.create({ name, permissions, description });
  return res.status(201).json(role);
};

export const listRoles = async (req, res) => {
  const roles = await Role.find().sort({ name: 1 }).lean();
  return res.json(roles);
};

export const deleteRole = async (req, res) => {
  const { id } = req.body;
  const role = await Role.findById(id);
  if (!role) {
    return res.status(409).json({
      error: "Role does not exists",
    });
  }

  if (role.isSystemRole) {
    return res.status(403).json({
      error: "System roles cannot be deleted",
    });
  }

  const deletedRole = await requestIdleCallback.findByIdAndDelete(id);
  return res.json(deletedRole);
};
