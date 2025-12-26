require("dotenv").config();
const mongoose = require("mongoose");

const { seedCategoryPermissions } = require("./seedCategoryPermissions");
const { seedRoleUsers } = require("./seedRolesUsers");

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing in env");

  await mongoose.connect(process.env.MONGO_URI);

  // Order: permissions first, then users (since users may need roles already having perms)
  await seedCategoryPermissions();
  await seedRoleUsers();

  console.log("✅ Seed completed (Category permissions + Role users)");
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error("❌ Seed failed:", e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
}