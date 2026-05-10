import Permission from "./admin-permissions.model.js";

export function isSuperSystemLevel(req) {
  return String(req.auth?.systemLevel || "NONE").toUpperCase() === "SUPER";
}

export const createPermission = async (req, res) => {
  if (!isSuperSystemLevel(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const permission = await Permission.create(req.body);
    res.status(201).json({ permission });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const listPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find();
    res.status(200).json({ permissions });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const updatePermissions = async (req, res) => {
  if (!isSuperSystemLevel(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const permissions = await Permission.find();
    res.status(200).json({ permissions });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const deletePermission = async (req, res) => {
  if (!isSuperSystemLevel(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const permission = await Permission.findByIdAndDelete(req.params.id);
    res.status(200).json({ permission });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
