import Role from "../models/roleModel.js";

export const getMe = async (req, res) => {
  const user = req.user;
  const roleDocs = await Role.find({ _id: { $in: user.roles || [] } })
    .select("_id name description systemLevel isSystemRole")
    .lean();

  res.json({
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      systemLevel: user.systemLevel || "NONE",
      isSystemUser: !!user.isSystemUser,
      disabled: !!user.disabled,
    },
    roles: roleDocs.map((role) => ({
      id: role._id,
      name: role.name,
      description: role.description || "",
      systemLevel: role.systemLevel || "NONE",
      isSystemRole: !!role.isSystemRole,
    })),
    permissions: Array.from(req.effectivePermissions || []),
    systemLevel: user.systemLevel || "NONE",
  });
};
