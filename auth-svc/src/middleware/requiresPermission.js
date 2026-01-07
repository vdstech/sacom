// Permission enforcement middleware.
// - Requires `requireAuth` to run before it.
// - SUPER admins bypass all checks.
// - ADMIN users:
//     * may READ permissions
//     * may NOT CREATE/UPDATE/DELETE permissions (hard deny)

const ADMIN_PERMISSION_DENY = new Set([
  "permission:create",
  "permission:update",
  "permission:delete",
  // include if you use a generic write/manage code
  "permission:write",
]);

function isPermissionDomain(code) {
  return typeof code === "string" && code.startsWith("permission:");
}

export function requiresPermission(codes) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const required = Array.isArray(codes) ? codes : [codes];

    // Bypass for SUPER admin
    if (req.auth.systemLevel === "SUPER") {
      return next();
    }

    // ADMIN special handling for permission management
    if (req.auth.systemLevel === "ADMIN") {
      // Hard deny for create/update/delete/write regardless of assigned perms
      if (required.some((c) => ADMIN_PERMISSION_DENY.has(c))) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Allow read of permission domain
      if (required.every((c) => c === "permission:read")) {
        return next();
      }

      // For any other permission:* operation, deny by default
      if (required.some((c) => isPermissionDomain(c))) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // For all non-permission domains, ADMIN bypasses (as per your rule)
      return next();
    }

    // Normal permission enforcement for non-admin users
    const perms = req.effectivePermissions;
    if (!perms || typeof perms.has !== "function") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log("####### User permissions:", Array.from(perms));
    console.log("####### code:", required);
    const hasAll = required.every((code) => perms.has(code));
    if (!hasAll) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
}

export default requiresPermission;
