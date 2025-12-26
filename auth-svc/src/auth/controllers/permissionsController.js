import Permission from "../models/permissionModel.js";
import Role from "../models/roleModel.js";

export const createPermission = async (req, res) => {
  try {
    console.log("Checking for admin role.....");
    const adminRole = await Role.findOne({ name: "ADMIN" });
    console.log("Checking for admin role.....2---------- ", adminRole);
    if (!adminRole) {
      // Fail loudly – invariant broken
      return res.status(500).json({
        error: "ADMIN role not found. Create ADMIN role first.",
      });
    }

    console.log("admin role is there..........creating permission............");
    // 1️⃣ Create permission FIRST
    const permission = await Permission.create(req.body);

    // 2️⃣ Attach permission to ADMIN role
    console.log("updating permission to admin role............");
    await Role.updateOne(
      { _id: adminRole._id },
      { $addToSet: { permissions: permission._id } }
    );

    // 3️⃣ Respond
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
  try {
    const permissions = await Permission.find();
    res.status(200).json({ permissions });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const deletePermission = async (req, res) => {
  try {
    const permission = await Permission.findByIdAndDelete(req.params.id);
    res.status(200).json({ permission });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
