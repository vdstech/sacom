import mongoose from "mongoose";
import Inventory from "./inventory.model.js";
import Product from "../product/product.model.js";
import Category from "../category/category.model.js";
import CustomerOrderRead from "./customerOrderRead.model.js";
import Variant from "../variant/variant.model.js";

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

export function resolveAvailableQuantity(entry) {
  const availableQty = Number(entry?.availableQty);
  if (Number.isFinite(availableQty)) return Math.max(0, availableQty);
  return Math.max(0, asNumber(entry?.quantity, 0));
}

function buildVariantOptionSummary(variant, fallbackSizeLabel = "") {
  const colorNames = Array.isArray(variant?.colors)
    ? variant.colors.map((entry) => normalizeString(entry?.name)).filter(Boolean)
    : [];
  const sizeLabel = normalizeString(fallbackSizeLabel || variant?.sizeLabel);
  const parts = [];
  if (colorNames.length) parts.push(colorNames.join(" / "));
  if (sizeLabel) parts.push(sizeLabel);
  return parts.join(" • ");
}

export function buildInventoryDashboardSummary({ items = [], productMap = new Map(), variantMap = new Map(), threshold = 2, limit = 8 }) {
  const normalizedThreshold = Math.max(0, asNumber(threshold, 2));
  const normalizedLimit = normalizePositiveInteger(limit, 8);
  const lowStockVariants = [];
  const outOfStockVariants = [];

  for (const item of items) {
    const variant = variantMap.get(String(item.variantId || "")) || null;
    const stockEntry = Array.isArray(variant?.stock)
      ? variant.stock.find((entry) => normalizeString(entry?.stockKey).toUpperCase() === normalizeString(item.stockKey).toUpperCase())
      : null;
    const product = productMap.get(String(item.productId || "")) || null;
    const availableStock = resolveAvailableQuantity(stockEntry || item);
    const variantSummary = buildVariantOptionSummary(variant, item.sizeLabel);
    const row = {
      inventoryId: String(item._id || ""),
      productId: String(item.productId || ""),
      variantId: String(item.variantId || ""),
      productTitle: normalizeString(product?.title, normalizeString(item.productTitle, item.stockKey)),
      productSlug: normalizeString(product?.slug),
      stockKey: normalizeString(item.stockKey).toUpperCase(),
      variantSummary,
      sizeLabel: normalizeString(item.sizeLabel),
      reorderLevel: Math.max(0, asNumber(stockEntry?.reorderLevel, asNumber(item.reorderLevel, 0))),
      availableStock,
    };

    if (availableStock === 0) {
      outOfStockVariants.push(row);
      continue;
    }

    if (availableStock < normalizedThreshold) {
      lowStockVariants.push(row);
    }
  }

  const sortByAvailableThenTitle = (left, right) => {
    if (left.availableStock !== right.availableStock) return left.availableStock - right.availableStock;
    return `${left.productTitle} ${left.stockKey}`.localeCompare(`${right.productTitle} ${right.stockKey}`);
  };

  lowStockVariants.sort(sortByAvailableThenTitle);
  outOfStockVariants.sort(sortByAvailableThenTitle);

  return {
    threshold: normalizedThreshold,
    lowStockVariantsCount: lowStockVariants.length,
    outOfStockVariantsCount: outOfStockVariants.length,
    lowStockVariants: lowStockVariants.slice(0, normalizedLimit),
    outOfStockVariants: outOfStockVariants.slice(0, normalizedLimit),
  };
}

function normalizeInventorySort(value, fallback = "updated_desc") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (["updated_desc", "updated_asc", "stock_asc", "stock_desc", "title_asc", "title_desc"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function buildCategoryName(category, categoryMap) {
  if (!category) return "Uncategorized";
  const names = [normalizeString(category?.name)];
  let cursor = category.parent ? categoryMap.get(String(category.parent)) || null : null;
  while (cursor) {
    const name = normalizeString(cursor?.name);
    if (name) names.unshift(name);
    cursor = cursor.parent ? categoryMap.get(String(cursor.parent)) || null : null;
  }
  return names.filter(Boolean).join(" / ") || "Uncategorized";
}

function buildInventoryRiskRows({ items = [], productMap = new Map(), variantMap = new Map(), categoryMap = new Map() }) {
  return items.map((item) => {
    const variant = variantMap.get(String(item.variantId || "")) || null;
    const stockEntry = Array.isArray(variant?.stock)
      ? variant.stock.find((entry) => normalizeString(entry?.stockKey).toUpperCase() === normalizeString(item.stockKey).toUpperCase())
      : null;
    const product = productMap.get(String(item.productId || "")) || null;
    const category = categoryMap.get(String(product?.categoryId || item.categoryId || "")) || null;
    const availableStock = resolveAvailableQuantity(stockEntry || item);
    const variantSummary = buildVariantOptionSummary(variant, item.sizeLabel);

    return {
      inventoryId: String(item._id || ""),
      productId: String(item.productId || ""),
      variantId: String(item.variantId || ""),
      productTitle: normalizeString(product?.title, normalizeString(item.productTitle, item.stockKey)),
      productSlug: normalizeString(product?.slug),
      stockKey: normalizeString(item.stockKey).toUpperCase(),
      variantSummary,
      sizeLabel: normalizeString(item.sizeLabel),
      categoryId: String(product?.categoryId || item.categoryId || ""),
      categoryName: buildCategoryName(category, categoryMap),
      availableStock,
      reorderLevel: Math.max(0, asNumber(stockEntry?.reorderLevel, asNumber(item.reorderLevel, 0))),
      updatedAt: item.updatedAt || null,
      isActive: product?.isActive !== false && variant?.isActive !== false,
      status: availableStock === 0 ? "OUT_OF_STOCK" : availableStock < 2 ? "LOW_STOCK" : "IN_STOCK",
    };
  });
}

function filterInventoryRiskRows({ rows = [], threshold = 2, mode = "overview", search = "" }) {
  const normalizedThreshold = Math.max(0, asNumber(threshold, 2));
  const normalizedSearch = normalizeString(search).toLowerCase();

  return rows.filter((row) => {
    if (mode === "low-stock" && !(row.availableStock > 0 && row.availableStock < normalizedThreshold)) return false;
    if (mode === "out-of-stock" && row.availableStock !== 0) return false;
    if (!normalizedSearch) return true;

    const haystack = [
      row.productTitle,
      row.productSlug,
      row.stockKey,
      row.variantSummary,
      row.sizeLabel,
      row.categoryName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
}

function sortInventoryRiskRows(rows = [], sort = "updated_desc") {
  const normalizedSort = normalizeInventorySort(sort);
  const items = [...rows];

  items.sort((left, right) => {
    if (normalizedSort === "stock_asc" && left.availableStock !== right.availableStock) {
      return left.availableStock - right.availableStock;
    }
    if (normalizedSort === "stock_desc" && left.availableStock !== right.availableStock) {
      return right.availableStock - left.availableStock;
    }
    if (normalizedSort === "title_asc") {
      return `${left.productTitle} ${left.stockKey}`.localeCompare(`${right.productTitle} ${right.stockKey}`);
    }
    if (normalizedSort === "title_desc") {
      return `${right.productTitle} ${right.stockKey}`.localeCompare(`${left.productTitle} ${left.stockKey}`);
    }

    const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
    if (normalizedSort === "updated_asc" && leftTime !== rightTime) return leftTime - rightTime;
    if (normalizedSort === "updated_desc" && leftTime !== rightTime) return rightTime - leftTime;
    if (left.availableStock !== right.availableStock) return left.availableStock - right.availableStock;
    return `${left.productTitle} ${left.stockKey}`.localeCompare(`${right.productTitle} ${right.stockKey}`);
  });

  return items;
}

function paginateRows(rows = [], page = 1, limit = 10) {
  const normalizedPage = normalizePositiveInteger(page, 1);
  const normalizedLimit = normalizePositiveInteger(limit, 10);
  const total = rows.length;
  return {
    items: rows.slice((normalizedPage - 1) * normalizedLimit, normalizedPage * normalizedLimit),
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages: total ? Math.ceil(total / normalizedLimit) : 1,
  };
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

async function loadInventoryDashboardContext({ categoryId = "" } = {}) {
  const filter = {};

  if (categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) {
      const error = new Error("categoryId must be a valid ObjectId");
      // @ts-ignore
      error.statusCode = 400;
      throw error;
    }

    const categoryIds = await loadCategoryFilterIds(categoryId);
    const matchingProducts = await Product.find({
      categoryId: { $in: categoryIds },
    })
      .select("_id")
      .lean();

    const matchingProductIds = matchingProducts.map((product) => product._id);
    if (!matchingProductIds.length) {
      return { rows: [], threshold: 2 };
    }
    filter.productId = { $in: matchingProductIds };
  }

  const docs = await Inventory.find(filter).sort({ updatedAt: -1 }).lean();
  if (!docs.length) {
    return { rows: [], threshold: 2 };
  }

  const productIds = [...new Set(docs.map((doc) => String(doc.productId || "")).filter(Boolean))];
  const variantIds = [...new Set(docs.map((doc) => String(doc.variantId || "")).filter(Boolean))];

  const [products, variants] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).select("_id title slug categoryId isActive").lean(),
    Variant.find({ _id: { $in: variantIds } }).select("_id colors sizeLabel stock isActive").lean(),
  ]);

  const categoryIds = [...new Set(products.map((product) => String(product.categoryId || "")).filter(Boolean))];
  const categories = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } }).select("_id name parent").lean()
    : [];

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const variantMap = new Map(variants.map((variant) => [String(variant._id), variant]));
  const categoryMap = new Map(categories.map((category) => [String(category._id), category]));
  const rows = buildInventoryRiskRows({ items: docs, productMap, variantMap, categoryMap });

  return {
    rows,
    threshold: 2,
  };
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

export async function getInventoryDashboardSummary(req, res) {
  try {
    const threshold = Math.max(0, asNumber(req.query?.threshold, 2));
    const limit = normalizePositiveInteger(req.query?.limit, 8);
    const { rows } = await loadInventoryDashboardContext({ categoryId: normalizeString(req.query?.categoryId) });
    const sortedRows = sortInventoryRiskRows(rows, "updated_desc");
    const lowStockRows = filterInventoryRiskRows({ rows: sortedRows, threshold, mode: "low-stock" });
    const outOfStockRows = filterInventoryRiskRows({ rows: sortedRows, threshold, mode: "out-of-stock" });
    const activeRows = sortedRows.filter((row) => row.isActive);
    const activeProductIds = new Set(activeRows.map((row) => row.productId).filter(Boolean));
    const categoryRisk = new Map();

    for (const row of [...lowStockRows, ...outOfStockRows]) {
      const key = row.categoryId || "uncategorized";
      if (!categoryRisk.has(key)) {
        categoryRisk.set(key, {
          categoryId: key,
          categoryName: row.categoryName || "Uncategorized",
          lowStockCount: 0,
          outOfStockCount: 0,
        });
      }
      const entry = categoryRisk.get(key);
      if (row.availableStock === 0) entry.outOfStockCount += 1;
      else entry.lowStockCount += 1;
    }

    return res.json({
      summary: {
        threshold,
        totalActiveProducts: activeProductIds.size,
        totalActiveVariants: activeRows.length,
        lowStockVariantsCount: lowStockRows.length,
        outOfStockVariantsCount: outOfStockRows.length,
        lowStockVariants: lowStockRows.slice(0, limit),
        outOfStockVariants: outOfStockRows.slice(0, limit),
        recentUpdatedItems: sortedRows.slice(0, limit),
        categoryRisk: Array.from(categoryRisk.values())
          .sort((left, right) => (right.outOfStockCount + right.lowStockCount) - (left.outOfStockCount + left.lowStockCount))
          .slice(0, limit),
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Failed to load inventory dashboard summary" });
  }
}

async function listInventoryByRisk(req, res, mode) {
  try {
    const threshold = Math.max(0, asNumber(req.query?.threshold, 2));
    const page = normalizePositiveInteger(req.query?.page, 1);
    const limit = normalizePositiveInteger(req.query?.limit, 10);
    const search = normalizeString(req.query?.search);
    const sort = normalizeInventorySort(req.query?.sort, mode === "out-of-stock" ? "updated_desc" : "stock_asc");
    const categoryId = normalizeString(req.query?.categoryId);
    const { rows } = await loadInventoryDashboardContext({ categoryId });
    const filteredRows = filterInventoryRiskRows({ rows, threshold, mode, search });
    const sortedRows = sortInventoryRiskRows(filteredRows, sort);
    return res.json(paginateRows(sortedRows, page, limit));
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || `Failed to load ${mode} inventory` });
  }
}

export async function listLowStockInventory(req, res) {
  return listInventoryByRisk(req, res, "low-stock");
}

export async function listOutOfStockInventory(req, res) {
  return listInventoryByRisk(req, res, "out-of-stock");
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
