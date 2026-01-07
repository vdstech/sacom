/**
 * Seeds multiple SiriCollections Shopify collections to MongoDB.
 * Writes into same Mongo collections:
 *  - products
 *  - product_variants
 *  - inventory
 *
 * ENV:
 *  DB_NAME=db_auth
 *  IMAGE_MODE=remote|local   (default: remote)
 *
 * Notes:
 *  - If IMAGE_MODE=local, images are downloaded into ./uploads/products
 *  - Public URLs stored in DB will be /uploads/products/...
 */

import mongoose from "mongoose";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";

// -------------------- ENV --------------------
// Mongo is always local on default port
const MONGO_URI = "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "db_auth";

// -------------------- CONFIG --------------------
const BASE = "https://siricollections.in";
const SLEEP_MS = 250;
const MAX_PAGES_GUARD = 120;

// -------------------- IMAGE STORAGE --------------------
// remote: keep Shopify CDN URLs in DB (fastest; good for initial dev)
// local : download images into ./uploads/products and store your own public URL in DB
const IMAGE_MODE = (process.env.IMAGE_MODE || "remote").toLowerCase(); // "remote" | "local"
const IMAGE_DIR = "./uploads/products";
const IMAGE_BASE_URL = "/uploads/products";
const IMAGE_DOWNLOAD_TIMEOUT_MS = Number(process.env.IMAGE_DOWNLOAD_TIMEOUT_MS || 20000);

// ✅ Paste / edit mapping here anytime
const COLLECTIONS = [
  // Sarees
  { handle: "plain-sarees", categoryId: "694fe42f4af789fbf2fc1d4c" },
  { handle: "printed-sarees", categoryId: "694fe44f4af789fbf2fc1d55" },
  { handle: "designer-sarees", categoryId: "694fe4584af789fbf2fc1d59" },
  { handle: "pattu-sarees", categoryId: "694fe4614af789fbf2fc1d5d" },
  { handle: "fancy-sarees", categoryId: "694fe4694af789fbf2fc1d61" },
  { handle: "cotton-sarees", categoryId: "694fe4724af789fbf2fc1d65" },
  { handle: "fancy-silk-sarees", categoryId: "694fe47a4af789fbf2fc1d69" },

  // Garden Vareli
  { handle: "plain-nara-chiffon", categoryId: "694fe4c34af789fbf2fc1d71" },
  { handle: "nara-chiffon", categoryId: "694fe4ca4af789fbf2fc1d76" },
  { handle: "super-nara-chiffon", categoryId: "694fe4d04af789fbf2fc1d7a" },
  { handle: "american-chiffon", categoryId: "694fe4d74af789fbf2fc1d7e" },
  { handle: "georgette", categoryId: "694fe4de4af789fbf2fc1d82" },
  { handle: "lentus", categoryId: "694fe4e44af789fbf2fc1d86" },
  { handle: "summer-roganza", categoryId: "694fe4ea4af789fbf2fc1d8a" },
  { handle: "crepe", categoryId: "694fe4ef4af789fbf2fc1d8e" },
  { handle: "brasso", categoryId: "694fe4f44af789fbf2fc1d92" },
  { handle: "other-garden-sarees", categoryId: "694fe4fa4af789fbf2fc1d96" },

  // Digital Prints
  { handle: "digital-chiffon-prints", categoryId: "694fe55b4af789fbf2fc1d9f" },
  { handle: "digital-georgette-prints", categoryId: "694fe5614af789fbf2fc1da4" },
  { handle: "digital-crepe-prints", categoryId: "694fe5644af789fbf2fc1da8" },
  { handle: "digital-satin-crepe", categoryId: "694fe56a4af789fbf2fc1dac" },
  { handle: "digital-satin-georgette", categoryId: "694fe56e4af789fbf2fc1db0" },

  // Jewellery
  { handle: "mangalsutra", categoryId: "694fe5af4af789fbf2fc1db7" },
  { handle: "necklace-sets", categoryId: "694fe5b54af789fbf2fc1dbc" },
  { handle: "bangles", categoryId: "694fe5b94af789fbf2fc1dc0" },
  { handle: "ear-rings", categoryId: "694fe5bd4af789fbf2fc1dc4" },
  { handle: "pendants", categoryId: "694fe5c04af789fbf2fc1dc8" },
  { handle: "idols", categoryId: "694fe5c34af789fbf2fc1dcc" },
  { handle: "other-jewellery", categoryId: "694fe5c74af789fbf2fc1dd0" },

  // Accessories
  { handle: "mangtikka", categoryId: "694fe5f34af789fbf2fc1dd4" },
  { handle: "waist-belts", categoryId: "694fe5fb4af789fbf2fc1dd9" },
  { handle: "beads", categoryId: "694fe5ff4af789fbf2fc1ddd" },
  { handle: "hair-jewellery", categoryId: "694fe6034af789fbf2fc1de1" },
  { handle: "accessories", categoryId: "694fe6064af789fbf2fc1de5" },

  // Sale
  { handle: "half-price-store", categoryId: "694fe6534af789fbf2fc1df6" },
];

// -------------------- HELPERS --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uniq(arr) {
  return [...new Set(arr)];
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return await res.text();
}

async function fetchProductJs(handle) {
  const url = `${BASE}/products/${handle}.js`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return await res.json();
}

function stripTrailingSlash(s) {
  return String(s || "").replace(/\/+$/, "");
}

function normalizeRemoteUrl(u) {
  const s = String(u || "").trim();
  if (!s) return s;

  // Shopify often returns protocol-relative URLs like //cdn.shopify.com/...
  if (s.startsWith("//")) return `https:${s}`;

  // If we ever get a root-relative path, make it absolute to siricollections.in
  if (s.startsWith("/")) return `${BASE}${s}`;

  return s;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function guessExtFromUrl(url) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname);
    if (ext && ext.length <= 5) return ext.toLowerCase();
  } catch {}
  return "";
}

function guessExtFromContentType(ct) {
  const c = String(ct || "").toLowerCase();
  if (c.includes("image/jpeg")) return ".jpg";
  if (c.includes("image/jpg")) return ".jpg";
  if (c.includes("image/png")) return ".png";
  if (c.includes("image/webp")) return ".webp";
  if (c.includes("image/gif")) return ".gif";
  return "";
}

async function fetchWithTimeout(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ac.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Downloads a remote image URL to local disk and returns the public URL to store in DB.
 * Files are stored in: `${IMAGE_DIR}/${productSlug}/${sortOrder}{ext}`
 */
async function downloadImageToLocal(remoteUrl, productSlug, sortOrder) {
  remoteUrl = normalizeRemoteUrl(remoteUrl);

  // Ensure base dir exists once
  await ensureDir(IMAGE_DIR);

  const res = await fetchWithTimeout(remoteUrl, IMAGE_DOWNLOAD_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Image GET failed: ${res.status} ${remoteUrl}`);

  const ct = res.headers.get("content-type") || "";
  let ext = guessExtFromUrl(remoteUrl) || guessExtFromContentType(ct) || ".jpg";

  // Ensure sane ext
  if (!/^\.[a-z0-9]{2,5}$/i.test(ext)) ext = ".jpg";

  const dir = path.join(IMAGE_DIR, productSlug);
  await ensureDir(dir);

  const filename = `${sortOrder}${ext}`;
  const filepath = path.join(dir, filename);

  const ab = await res.arrayBuffer();
  await fs.writeFile(filepath, Buffer.from(ab));

  const base = stripTrailingSlash(IMAGE_BASE_URL);
  return `${base}/${productSlug}/${filename}`;
}

async function buildImages(pjImages, title, productSlug) {
  const urls = (pjImages || []).slice(0, 20).map(normalizeRemoteUrl);

  // Default: keep Shopify CDN URLs (fast, no storage required)
  if (IMAGE_MODE !== "local") {
    return urls.map((u, idx) => ({
      url: u,
      alt: title,
      sortOrder: idx + 1
    }));
  }

  // Local mode: download each image and store your own URL
  const out = [];
  for (let idx = 0; idx < urls.length; idx++) {
    const remoteUrl = urls[idx];
    try {
      const localUrl = await downloadImageToLocal(remoteUrl, productSlug, idx + 1);
      out.push({ url: localUrl, alt: title, sortOrder: idx + 1 });
    } catch (e) {
      // Fallback: if download fails, still store the remote URL so product doesn't lose images
      console.warn("Image download failed, keeping remote URL:", remoteUrl, e?.message || e);
      out.push({ url: remoteUrl, alt: title, sortOrder: idx + 1 });
    }
    await sleep(SLEEP_MS);
  }
  return out;
}

function extractHandlesFromCollectionHtml(html, collectionHandle) {
  const re = new RegExp(`/collections/${collectionHandle}/products/([a-z0-9-]+)`, "g");
  const handles = [];
  let m;
  while ((m = re.exec(html)) !== null) handles.push(m[1]);
  return uniq(handles);
}

function parseFallbackSkuFromProductPage(html) {
  const $ = cheerio.load(html);
  const text = $.text().replace(/\s+/g, " ");
  const m = text.match(/SKU:\s*([A-Z0-9_-]+)/i);
  return m ? m[1].trim().toUpperCase() : null;
}

// -------------------- MODELS (explicit collection names) --------------------
const ProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    primaryCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    tags: [{ type: String }],
    currency: { type: String, default: "INR" },
    images: [{ url: String, alt: String, sortOrder: Number }],
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);
const Product = mongoose.model("Product", ProductSchema, "products");

const VariantSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, unique: true },
    optionValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    compareAtPrice: { type: Number, default: 0, min: 0 },
    isDefault: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);
const Variant = mongoose.model("Variant", VariantSchema, "product_variants");

const InventorySchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", required: true },
    trackInventory: { type: Boolean, default: true },
    availableQty: { type: Number, default: 0, min: 0 },
    reservedQty: { type: Number, default: 0, min: 0 },
    allowBackorder: { type: Boolean, default: false }
  },
  { timestamps: true }
);
const Inventory = mongoose.model("Inventory", InventorySchema, "inventory");

// -------------------- SEED ONE COLLECTION --------------------
async function seedCollection({ handle, categoryId }) {
  const categoryObjId = new mongoose.Types.ObjectId(categoryId);
  const collectionUrl = `${BASE}/collections/${handle}`;

  console.log(`\n=== SEED: ${collectionUrl} -> categoryId=${categoryId} ===`);

  // 1) Discover handles
  const all = [];
  for (let page = 1; page <= MAX_PAGES_GUARD; page++) {
    const html = await fetchText(`${collectionUrl}?page=${page}`);
    const handles = extractHandlesFromCollectionHtml(html, handle);
    if (handles.length === 0) break;
    console.log(`Page ${page}: ${handles.length}`);
    all.push(...handles);
    await sleep(SLEEP_MS);
  }

  const productHandles = uniq(all);
  console.log(`TOTAL: ${productHandles.length}`);

  // 2) Insert/Upsert
  let ok = 0, failed = 0;

  for (const ph of productHandles) {
    try {
      let pj;
      try {
        pj = await fetchProductJs(ph);
      } catch {
        const productPageUrl = `${collectionUrl}/products/${ph}`;
        const html = await fetchText(productPageUrl);
        const sku = parseFallbackSkuFromProductPage(html) || ph.toUpperCase();
        pj = {
          title: ph,
          handle: ph,
          vendor: "",
          product_type: "",
          tags: [],
          body_html: "",
          images: [],
          variants: [{ title: "Default Title", sku, price: "0.00", compare_at_price: null, inventory_quantity: 0 }]
        };
      }

      const title = pj.title || ph;
      const slug = slugify(pj.handle || ph);

      const images = await buildImages(pj.images || [], title, slug);

      const attributes = {
        vendor: pj.vendor || "",
        productType: pj.product_type || "",
        sourceCollection: handle
      };

      const product = await Product.findOneAndUpdate(
        { slug },
        {
          $set: {
            title,
            slug,
            description: pj.body_html ? String(pj.body_html) : "",
            primaryCategoryId: categoryObjId,
            categoryIds: [categoryObjId],
            tags: pj.tags || [],
            images,
            attributes,
            currency: "INR",
            isActive: true
          }
        },
        { new: true, upsert: true }
      );

      const v0 = pj.variants?.[0] || null;
      const sku = String(v0?.sku || ph).trim().toUpperCase();

      const price = Number(v0?.price || 0);
      const compareAt = Number(v0?.compare_at_price || 0);
      const mrp = compareAt > 0 ? compareAt : price;

      const variant = await Variant.findOneAndUpdate(
        { sku },
        {
          $set: {
            productId: product._id,
            sku,
            optionValues: { title: v0?.title || "Default Title" },
            price,
            mrp,
            compareAtPrice: compareAt,
            isDefault: true,
            isActive: true
          }
        },
        { new: true, upsert: true }
      );

      const invQtyRaw = v0?.inventory_quantity;
      const availableQty = typeof invQtyRaw === "number" && invQtyRaw >= 0 ? invQtyRaw : 0;

      await Inventory.findOneAndUpdate(
        { sku },
        {
          $set: {
            sku,
            productId: product._id,
            variantId: variant._id,
            trackInventory: true,
            availableQty,
            reservedQty: 0,
            allowBackorder: false
          }
        },
        { new: true, upsert: true }
      );

      ok++;
      if (ok % 25 === 0) console.log(`Progress: ${ok}/${productHandles.length}`);
      await sleep(SLEEP_MS);
    } catch (err) {
      failed++;
      console.error("FAILED:", ph, err.message);
    }
  }

  console.log(`DONE ${handle}: ok=${ok} failed=${failed}`);
}

// -------------------- MAIN --------------------
(async function main() {
  await mongoose.connect(MONGO_URI, { dbName });

  for (const entry of COLLECTIONS) {
    await seedCollection(entry);
  }

  await mongoose.disconnect();
  console.log("\n✅ All collections seeded.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});