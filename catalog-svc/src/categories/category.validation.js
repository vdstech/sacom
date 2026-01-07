function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateCreate(req, res, next) {
  const { name, slug } = req.body;

  if (!isNonEmptyString(name)) {
    return res.status(400).json({ error: "name is required" });
  }
  if (slug !== undefined && !isNonEmptyString(slug)) {
    return res.status(400).json({ error: "slug must be a non-empty string if provided" });
  }
  next();
}

export function validateUpdate(req, res, next) {
  const { name, slug } = req.body;

  if (name !== undefined && !isNonEmptyString(name)) {
    return res.status(400).json({ error: "name must be a non-empty string if provided" });
  }
  if (slug !== undefined && !isNonEmptyString(slug)) {
    return res.status(400).json({ error: "slug must be a non-empty string if provided" });
  }
  next();
}
