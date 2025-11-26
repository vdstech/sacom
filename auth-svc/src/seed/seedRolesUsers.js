import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Role from '../model/role.js';
import User from '../model/user.js';
import Permission from "../model/permission.js";
import { hashPassword } from "../security/password.js";

const SUPER_ADMIN_EMAIL = "superadmin@sacom.com";
const SUPER_ADMIN_PASSWORD = "SuperAdmin1!";

async function seed() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  // 1. Create all permissions
  console.log("Creating permissions...");

  const permissionCodes = [
    "PERMISSION_CREATE",
    "PERMISSION_UPDATE",
    "PERMISSION_DELETE",
    "PERMISSION_READ",
    "ROLE_CREATE",
    "ROLE_UPDATE",
    "ROLE_DELETE",
    "ROLE_READ",
    "USER_CREATE",
    "USER_UPDATE",
    "USER_DELETE",
    "USER_READ"
  ];

  const permissionDocs = [];
  for (const code of permissionCodes) {
    const perm = await Permission.findOneAndUpdate(
      { code },
      { code },
      { upsert: true, new: true }
    );
    permissionDocs.push(perm);
  }

  console.log("Initial Permissions ensured");

  // 2. SUPER_ADMIN Role (full permissions)
  console.log("Creating SUPER_ADMIN role...");
  
  const superAdminRole = await Role.findOneAndUpdate(
    { name: "SUPER_ADMIN" },
    { name: "SUPER_ADMIN", permissions: permissionDocs.map(p => p._id) },
    { upsert: true, new: true }
  );

  console.log("SUPER_ADMIN role ready");

  // 4. Create SUPER_ADMIN user
  console.log("Creating SUPER_ADMIN user");

  const superAdminPasswordHash = await hashPassword(SUPER_ADMIN_PASSWORD);
  await User.findOneAndUpdate(
    { email: SUPER_ADMIN_EMAIL },
    {
      name: "Super Admin",
      email: SUPER_ADMIN_EMAIL,
      passwordHash: superAdminPasswordHash,
      role: superAdminRole._id,
      disabled: false
    },
    { upsert: true }
  );

  console.log("SUPER_ADMIN user seeded");
  console.log("Seeding completed successfully");
  mongoose.connection.close();
}

seed().catch(err => {
  console.error("ERROR while seeding the Super Admin:", err);
  mongoose.connection.close();
});
