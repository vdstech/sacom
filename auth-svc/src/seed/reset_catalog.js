/**
 * DANGER: Deletes ALL documents from:
 *  - products
 *  - product_variants
 *  - inventory
 *
 * ENV:
 *  MONGO_URI=...
 *  DB_NAME=db_auth
 */

import mongoose from "mongoose";
import * as cheerio from "cheerio";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "db_auth";

if (!MONGO_URI) throw new Error("Missing env MONGO_URI");

(async function main() {
  await mongoose.connect(MONGO_URI, { dbName });

  const db = mongoose.connection.db;

  const collections = ["products", "product_variants", "inventory"];
  for (const c of collections) {
    const result = await db.collection(c).deleteMany({});
    console.log(`Deleted from ${c}:`, result.deletedCount);
  }

  await mongoose.disconnect();
  console.log("✅ Catalog reset complete.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});