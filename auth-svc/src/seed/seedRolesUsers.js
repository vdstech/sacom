import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Permission from "../auth/model/permission.js";
import Role from "../auth/model/role.js";
import User from "../auth/model/user.js";
import { hashPassword } from "../security/password.js";

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  // ---------------------------------------------------------
  // 1. PERMISSION HIERARCHY (NAMESPACED)
  // ---------------------------------------------------------
  const permissionGroups = {
    "user:write": [
      "user:read",
      "user:create",
      "user:update",
      "user:delete"
    ],
    "role:write": [
      "role:read",
      "role:create",
      "role:update",
      "role:delete"
    ],
    "permission:write": [
      "permission:read",
      "permission:create",
      "permission:update",
      "permission:delete"
    ]
  };

  // Leaf permissions
  const leafCodes = new Set();
  Object.values(permissionGroups).forEach(children =>
    children.forEach(child => leafCodes.add(child))
  );

  // Group permissions
  const groupCodes = Object.keys(permissionGroups);

  const permissionDocs = {};

  // ---------------------------------------------------------
  // 2. Seed all leaf permissions
  // ---------------------------------------------------------
  for (const code of leafCodes) {
    const perm = await Permission.findOneAndUpdate(
      { code },
      { code, children: [] },
      { upsert: true, new: true }
    );
    permissionDocs[code] = perm;
  }

  // ---------------------------------------------------------
  // 3. Seed all group permissions
  // ---------------------------------------------------------
  for (const code of groupCodes) {
    const perm = await Permission.findOneAndUpdate(
      { code },
      { code },
      { upsert: true, new: true }
    );
    permissionDocs[code] = perm;
  }

  // ---------------------------------------------------------
  // 4. Attach children to group permissions
  // ---------------------------------------------------------
  for (const [group, childrenCodes] of Object.entries(permissionGroups)) {
    const childIds = childrenCodes.map(code => permissionDocs[code]._id);

    await Permission.findByIdAndUpdate(permissionDocs[group]._id, {
      children: childIds
    });
  }

  console.log("Permission groups updated\n");

  // ---------------------------------------------------------
  // 5. Create ROLES
  // ---------------------------------------------------------

  // SUPER_ADMIN → USER + ROLE + PERMISSION (all group permissions)
  const superAdminRole = await Role.findOneAndUpdate(
    { name: "SUPER_ADMIN" },
    {
      name: "SUPER_ADMIN",
      permissions: groupCodes.map(code => permissionDocs[code]._id),
      isSystemRole: true,
      systemLevel: "SUPER"
    },
    { upsert: true, new: true }
  );

  console.log("SUPER_ADMIN role ready");

  // ADMIN → ONLY USER permissions
  const adminRole = await Role.findOneAndUpdate(
    { name: "ADMIN" },
    {
      name: "ADMIN",
      permissions: [
        permissionDocs["user:write"]._id
      ],
      isSystemRole: true,
      systemLevel: "ADMIN"
    },
    { upsert: true, new: true }
  );

  console.log("ADMIN role ready");

  // ---------------------------------------------------------
  // 6. Create users
  // ---------------------------------------------------------

  // SUPER ADMIN USER
  const superPass = await hashPassword("SuperAdmin@123");
  await User.findOneAndUpdate(
    { email: "superadmin@sa.com" },
    {
      name: "Super Admin",
      email: "superadmin@sa.com",
      password: superPass,
      passwordHash: superPass,
      roles: [superAdminRole._id],
      isSystemUser: true
    },
    { upsert: true }
  );

  console.log("Users created\n");

  mongoose.connection.close();
  console.log("Seeding complete!");
}

seed();