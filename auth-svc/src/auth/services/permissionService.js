import Role from "../models/roleModel.js";

// returns a Set of permission codes
export async function computeEffectivePermissionsForUser(user) {
  // user.roles is array of roleIds
  const roles = await Role.find({ _id: { $in: user.roles || [] } })
    .populate({
      path: "permissions",
      select: "code children",
      populate: { path: "children", select: "code children", populate: { path: "children", select: "code" } },
    })
    .lean();

  const codes = new Set();

  const collect = (p) => {
    if (!p) return;
    if (p.code) codes.add(p.code);
    if (Array.isArray(p.children)) p.children.forEach(collect);
  };

  for (const r of roles) {
    (r.permissions || []).forEach(collect);
  }

  return codes;
}