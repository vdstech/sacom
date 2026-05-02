import Role from "../admin-roles/admin-roles.model.js";
import { ADMIN_MENU_IDS, normalizeVisibleMenus } from "../admin-roles/admin-menu-catalog.js";

export const getMe = async (req, res) => {
  const user = req.user;
  const roleDocs = await Role.find({ _id: { $in: user.roles || [] } })
    .select("_id name description systemLevel isSystemRole visibleMenus visibleMenusConfigured")
    .lean();

  const systemLevel = user.systemLevel || "NONE";
  const isSystemLevelBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const visibleMenusConfigured = !isSystemLevelBypass && roleDocs.length > 0 && roleDocs.every((role) => !!role.visibleMenusConfigured);
  const visibleMenuSet = new Set();

  if (isSystemLevelBypass) {
    for (const menuId of normalizeVisibleMenus(ADMIN_MENU_IDS)) {
      visibleMenuSet.add(menuId);
    }
  } else if (visibleMenusConfigured) {
    for (const role of roleDocs) {
      for (const menuId of normalizeVisibleMenus(role.visibleMenus || [])) {
        visibleMenuSet.add(menuId);
      }
    }
  }

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
      visibleMenusConfigured: !!role.visibleMenusConfigured,
      visibleMenus: normalizeVisibleMenus(role.visibleMenus || []),
    })),
    permissions: Array.from(req.effectivePermissions || []),
    visibleMenus: Array.from(visibleMenuSet),
    visibleMenusConfigured,
    systemLevel,
  });
};
