import mongoose from "mongoose";
import Inventory from "./inventory.model.js";
import Product from "../product/product.model.js";
import Category from "../category/category.model.js";
import CustomerOrderRead from "./customerOrderRead.model.js";

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeStatus(value, fallback = "") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (normalized === "pending" || normalized === "placed") return "processing";
  return normalized || fallback;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildInventoryListResponse({ items = [], total = 0, page = 1, limit = 50 }) {
  const normalizedPage = normalizePositiveInteger(page, 1);
  const normalizedLimit = normalizePositiveInteger(limit, 50);
  const normalizedTotal = Math.max(0, asNumber(total, 0));

  return {
    items,
    total: normalizedTotal,
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages: normalizedTotal ? Math.ceil(normalizedTotal / normalizedLimit) : 1,
  };
}

export function buildInventorySearchClause(search, matchingProductIds = []) {
  const normalizedSearch = normalizeString(search);
  if (!normalizedSearch) return null;

  const pattern = new RegExp(escapeRegExp(normalizedSearch), "i");
  const clauses = [{ stockKey: pattern }, { sizeLabel: pattern }];

  if (Array.isArray(matchingProductIds) && matchingProductIds.length) {
    clauses.push({ productId: { $in: matchingProductIds } });
  }

  return { $or: clauses };
}

async function loadCategoryFilterIds(categoryId) {
  const rootId = new mongoose.Types.ObjectId(categoryId);
  const categories = await Category.find({
    $or: [
      { _id: rootId },
      { ancestors: rootId },
    ],
  })
    .select("_id")
    .lean();

  return categories.map((category) => new mongoose.Types.ObjectId(category._id));
}

async function loadSalesSummary(stockKeys = []) {
  if (!stockKeys.length) return new Map();

  const rows = await CustomerOrderRead.aggregate([
    {
      $match: {
        status: { $ne: "cancelled" },
        "items.stockKey": { $in: stockKeys },
      },
    },
    { $sort: { placedAt: -1, createdAt: -1 } },
    { $unwind: "$items" },
    {
      $match: {
        "items.stockKey": { $in: stockKeys },
        "items.fulfillmentStatus": { $ne: "cancelled" },
      },
    },
    {
      $group: {
        _id: "$items.stockKey",
        soldQuantity: {
          $sum: {
            $cond: [{ $gt: ["$items.quantity", 0] }, "$items.quantity", 0],
          },
        },
        orderRefs: {
          $push: {
            orderId: { $toString: "$_id" },
            title: "$items.title",
            quantity: "$items.quantity",
            placedAt: "$placedAt",
            status: "$status",
            fulfillmentStatus: "$items.fulfillmentStatus",
          },
        },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id || "").toUpperCase(), row]));
}

export async function listInventory(req, res) {
  try {
    const {
      categoryId,
      productId,
      variantId,
      sizeLabel,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (categoryId) {
      if (!mongoose.isValidObjectId(categoryId)) {
        return res.status(400).json({ error: "categoryId must be a valid ObjectId" });
      }

      const categoryIds = await loadCategoryFilterIds(categoryId);
      const matchingProducts = await Product.find({
        categoryId: { $in: categoryIds },
      })
        .select("_id")
        .lean();

      const matchingProductIds = matchingProducts.map((product) => product._id);
      if (!matchingProductIds.length) {
        return res.json(buildInventoryListResponse({ items: [], total: 0, page, limit }));
      }

      filter.productId = { $in: matchingProductIds };
    }
    if (productId) {
      if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ error: "productId must be a valid ObjectId" });
      }
      filter.productId = filter.productId
        ? {
            $in: Array.isArray(filter.productId.$in)
              ? filter.productId.$in.filter((value) => String(value) === String(productId))
              : [new mongoose.Types.ObjectId(productId)],
          }
        : new mongoose.Types.ObjectId(productId);

      if (filter.productId?.$in && !filter.productId.$in.length) {
        return res.json(buildInventoryListResponse({ items: [], total: 0, page, limit }));
      }
    }
    if (variantId) {
      if (!mongoose.isValidObjectId(variantId)) {
        return res.status(400).json({ error: "variantId must be a valid ObjectId" });
      }
      filter.variantId = new mongoose.Types.ObjectId(variantId);
    }
    if (sizeLabel) filter.sizeLabel = new RegExp(`^${escapeRegExp(String(sizeLabel).trim())}$`, "i");

    const normalizedSearch = normalizeString(search);
    if (normalizedSearch) {
      const productSearchFilter = {};
      if (filter.productId?.$in) {
        productSearchFilter._id = { $in: filter.productId.$in };
      } else if (filter.productId) {
        productSearchFilter._id = filter.productId;
      }

      const matchingSearchProducts = await Product.find({
        ...productSearchFilter,
        $or: [{ title: new RegExp(escapeRegExp(normalizedSearch), "i") }, { slug: new RegExp(escapeRegExp(normalizedSearch), "i") }],
      })
        .select("_id")
        .lean();

      const searchClause = buildInventorySearchClause(
        normalizedSearch,
        matchingSearchProducts.map((product) => product._id)
      );

      if (searchClause) Object.assign(filter, searchClause);
    }

    const normalizedPage = normalizePositiveInteger(page, 1);
    const normalizedLimit = normalizePositiveInteger(limit, 50);
    const total = await Inventory.countDocuments(filter);
    const docs = await Inventory.find(filter)
      .sort({ updatedAt: -1 })
      .skip((normalizedPage - 1) * normalizedLimit)
      .limit(normalizedLimit)
      .lean();

    const productIds = [...new Set(docs.map((doc) => String(doc.productId || "")).filter(Boolean))];
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select("_id title slug categoryId").lean()
      : [];
    const productMap = new Map(products.map((product) => [String(product._id), product]));

    const salesMap = await loadSalesSummary(
      docs.map((doc) => normalizeString(doc.stockKey).toUpperCase()).filter(Boolean)
    );

    const items = docs.map((doc) => {
      const product = productMap.get(String(doc.productId || ""));
      const sales = salesMap.get(normalizeString(doc.stockKey).toUpperCase());
      const soldQuantity = Math.max(0, asNumber(sales?.soldQuantity, 0));
      const quantity = Math.max(0, asNumber(doc.quantity, 0));

      return {
        ...doc,
        productTitle: normalizeString(product?.title),
        productSlug: normalizeString(product?.slug),
        categoryId: product?.categoryId ? String(product.categoryId) : "",
        currentQuantity: quantity,
        soldQuantity,
        initialQuantity: quantity + soldQuantity,
        orderRefs: Array.isArray(sales?.orderRefs)
          ? sales.orderRefs.map((entry) => ({
              orderId: normalizeString(entry?.orderId),
              title: normalizeString(entry?.title),
              quantity: Math.max(0, asNumber(entry?.quantity, 0)),
              placedAt: entry?.placedAt || null,
              status: normalizeString(entry?.status),
              fulfillmentStatus: normalizeStatus(entry?.fulfillmentStatus, "processing"),
            }))
          : [],
      };
    });

    return res.json(buildInventoryListResponse({
      items,
      total,
      page: normalizedPage,
      limit: normalizedLimit,
    }));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list stock" });
  }
}

export async function updateInventory(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Inventory id must be a valid ObjectId" });
    }

    const body = req.body || {};
    const patch = {
      updatedBy: req.user?._id || null,
    };

    if (body.quantity !== undefined) patch.quantity = Math.max(0, asNumber(body.quantity, 0));
    if (body.reorderLevel !== undefined) patch.reorderLevel = Math.max(0, asNumber(body.reorderLevel, 0));
    if (body.sizeLabel !== undefined) patch.sizeLabel = normalizeString(body.sizeLabel);

    const doc = await Inventory.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: "Inventory not found" });

    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update stock" });
  }
}
