const ADMIN_PERMISSION_DENY = new Set([
  "permission:create",
  "permission:update",
  "permission:delete",
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

    if (req.auth.systemLevel === "SUPER") return next();

    if (req.auth.systemLevel === "ADMIN") {
      if (required.some((code) => ADMIN_PERMISSION_DENY.has(code))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (required.every((code) => code === "permission:read")) {
        return next();
      }
      if (required.some((code) => isPermissionDomain(code))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return next();
    }

    const perms = req.effectivePermissions;
    if (!perms || typeof perms.has !== "function") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const hasAll = required.every((code) => perms.has(code));
    if (!hasAll) return res.status(403).json({ error: "Forbidden" });

    return next();
  };
}
