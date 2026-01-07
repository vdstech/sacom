/**
 * Fix duplicate SKUs across:
 *  - product_variants
 *  - inventory
 *
 * Strategy (recommended):
 *  1) Normalize SKU (trim + uppercase)
 *  2) In product_variants: if duplicates exist, keep the first as-is,
 *     rename others to `${OLD}-${last6(_id)}` (guaranteed unique)
 *  3) Update inventory.sku for those variantIds to the new SKU
 *  4) Sync all inventory.sku from product_variants.sku using variantId
 *  5) Merge duplicate inventory rows if multiple docs exist for SAME variantId
 *
 * ENV:
 *  MONGO_URI=...
 *  DB_NAME=db_auth
 *  DRY_RUN=true|false   (default true)
 */

import mongoose from "mongoose";
import * as cheerio from "cheerio";

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || "db_auth";
const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() === "true";

if (!MONGO_URI) throw new Error("Missing env MONGO_URI");

// Minimal schemas (explicit collection names)
const VariantSchema = new mongoose.Schema({}, { strict: false });
const InventorySchema = new mongoose.Schema({}, { strict: false });

const Variant = mongoose.model("Variant", VariantSchema, "product_variants");
const Inventory = mongoose.model("Inventory", InventorySchema, "inventory");

function normSku(s) {
  if (s == null) return null;
  const v = String(s).trim();
  if (!v) return null;
  return v.toUpperCase();
}

function suffixFromId(id) {
  const s = String(id);
  return s.slice(-6).toUpperCase();
}

async function ensureSkuUnique(desiredSku) {
  // Ensure desiredSku does not exist in product_variants or inventory
  let sku = desiredSku;
  let i = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existsVariant = await Variant.exists({ sku });
    const existsInv = await Inventory.exists({ sku });
    if (!existsVariant && !existsInv) return sku;

    i += 1;
    sku = `${desiredSku}-${i}`;
  }
}

async function normalizeSkus() {
  // Normalize variant SKUs
  const vCursor = Variant.find({ sku: { $exists: true, $ne: null } }, { _id: 1, sku: 1 }).lean().cursor();
  let vUpdated = 0;

  for await (const v of vCursor) {
    const n = normSku(v.sku);
    if (n && n !== v.sku) {
      vUpdated++;
      if (!DRY_RUN) await Variant.updateOne({ _id: v._id }, { $set: { sku: n } });
    }
  }

  // Normalize inventory SKUs
  const iCursor = Inventory.find({ sku: { $exists: true, $ne: null } }, { _id: 1, sku: 1 }).lean().cursor();
  let iUpdated = 0;

  for await (const inv of iCursor) {
    const n = normSku(inv.sku);
    if (n && n !== inv.sku) {
      iUpdated++;
      if (!DRY_RUN) await Inventory.updateOne({ _id: inv._id }, { $set: { sku: n } });
    }
  }

  console.log(`Normalize SKUs => variants updated: ${vUpdated}, inventory updated: ${iUpdated} ${DRY_RUN ? "(dry-run)" : ""}`);
}

async function fixDuplicateVariantSkus() {
  // Find duplicate SKUs in product_variants
  const dups = await Variant.aggregate([
    { $match: { sku: { $type: "string", $ne: "" } } },
    { $group: { _id: "$sku", ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);

  console.log(`Duplicate SKUs in product_variants: ${dups.length}`);

  let renamed = 0;

  for (const g of dups) {
    const oldSku = g._id;
    const ids = g.ids;

    // keep first as-is, rename rest
    for (let idx = 1; idx < ids.length; idx++) {
      const variantId = ids[idx];
      const base = `${oldSku}-${suffixFromId(variantId)}`;
      const newSku = await ensureSkuUnique(base);

      renamed++;
      console.log(`Variant SKU rename: ${oldSku} -> ${newSku} (variantId=${variantId})`);

      if (!DRY_RUN) {
        await Variant.updateOne({ _id: variantId }, { $set: { sku: newSku } });

        // Update inventory row(s) for that variantId to keep in sync
        await Inventory.updateMany({ variantId }, { $set: { sku: newSku } });
      }
    }
  }

  console.log(`Variant SKU renamed: ${renamed} ${DRY_RUN ? "(dry-run)" : ""}`);
}

async function syncInventorySkuFromVariant() {
  // For every inventory doc with variantId, set inventory.sku = variant.sku
  const cursor = Inventory.find(
    { variantId: { $exists: true, $ne: null } },
    { _id: 1, sku: 1, variantId: 1 }
  ).lean().cursor();

  let synced = 0;
  let missingVariant = 0;

  for await (const inv of cursor) {
    const v = await Variant.findById(inv.variantId, { sku: 1 }).lean();
    if (!v || !v.sku) {
      missingVariant++;
      continue;
    }

    const invSku = normSku(inv.sku);
    const varSku = normSku(v.sku);

    if (invSku !== varSku) {
      synced++;
      console.log(`Inventory SKU sync: inv=${inv._id} ${invSku} -> ${varSku} (variantId=${inv.variantId})`);
      if (!DRY_RUN) {
        await Inventory.updateOne({ _id: inv._id }, { $set: { sku: varSku } });
      }
    }
  }

  console.log(`Inventory SKU synced: ${synced}, inventory with missing variant: ${missingVariant} ${DRY_RUN ? "(dry-run)" : ""}`);
}

async function mergeDuplicateInventoryRowsPerVariant() {
  // If inventory has multiple docs for same variantId, merge into one
  const groups = await Inventory.aggregate([
    { $match: { variantId: { $exists: true, $ne: null } } },
    { $group: { _id: "$variantId", ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);

  console.log(`Duplicate inventory rows by variantId: ${groups.length}`);

  let merged = 0;
  let deleted = 0;

  for (const g of groups) {
    const ids = g.ids;
    const keepId = ids[0];
    const deleteIds = ids.slice(1);

    const docs = await Inventory.find({ _id: { $in: ids } }).lean();

    // Sum quantities (if fields exist)
    const sum = (k) => docs.reduce((a, d) => a + (Number(d[k] || 0) || 0), 0);

    const newAvailable = sum("availableQty");
    const newReserved = sum("reservedQty");

    console.log(
      `Merge inventory variantId=${g._id}: keep=${keepId}, delete=${deleteIds.length}, availableQty=${newAvailable}, reservedQty=${newReserved}`
    );

    merged++;
    deleted += deleteIds.length;

    if (!DRY_RUN) {
      await Inventory.updateOne(
        { _id: keepId },
        { $set: { availableQty: newAvailable, reservedQty: newReserved } }
      );
      await Inventory.deleteMany({ _id: { $in: deleteIds } });
    }
  }

  console.log(`Inventory merged groups: ${merged}, inventory docs deleted: ${deleted} ${DRY_RUN ? "(dry-run)" : ""}`);
}

(async function main() {
  console.log(`DB=${DB_NAME} DRY_RUN=${DRY_RUN}`);
  await mongoose.connect(MONGO_URI, { dbName: DB_NAME });

  // 0) Normalize SKUs (helps reduce false duplicates like "gvp1110" vs "GVP1110")
  await normalizeSkus();

  // 1) Fix duplicates in product_variants + update inventory for same variantId
  await fixDuplicateVariantSkus();

  // 2) Sync inventory.sku from variant.sku everywhere
  await syncInventorySkuFromVariant();

  // 3) Merge accidental duplicate inventory rows for same variantId
  await mergeDuplicateInventoryRowsPerVariant();

  await mongoose.disconnect();

  console.log("\n✅ Done.");
  console.log("\nNext step (after you confirm no duplicates): create unique indexes:");
  console.log('  db.product_variants.createIndex({ sku: 1 }, { unique: true })');
  console.log('  db.inventory.createIndex({ sku: 1 }, { unique: true })');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});