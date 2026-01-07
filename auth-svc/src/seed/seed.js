import "dotenv/config";
import mongoose from "mongoose";
import { seedCategoryPermissions } from "./seedCategoryPermissions.js";
import { seedRoleUsers } from "./seedRolesUsers.js";
import { fileURLToPath } from "url";

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing in env");

  await mongoose.connect(process.env.MONGO_URI);

  await seedCategoryPermissions();
  await seedRoleUsers();

  console.log("✅ Seed completed (Category permissions + Role users)");
  await mongoose.disconnect();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(async (e) => {
    console.error("❌ Seed failed:", e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
}