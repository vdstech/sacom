import mongoose from "mongoose";
import Product from "./product.model.js";
import Variant from "../variant/variant.model.js";
import Inventory from "../inventory/inventory.model.js";
import Category from "../category/category.model.js";
import {
  mapAdminListItem,
  mapAdminProductDetail,
  mapStorefrontListItem,
  mapStorefrontProductDetail,
} from "./response.dto.js";
import {
  getCategoryDefinitionConfig,
  normalizeProductDetails,
  validateProductDetails,
} from "./categoryConfig.js";
import {
  normalizeReturnPolicyWithDefaults,
  normalizeShippingWithDefaults,
} from "./defaultMetadata.js";

// This controller is the product read/write boundary for both admin and storefront
// traffic. It owns the runtime effective-price calculation, storefront facet
// aggregation, and DTO shaping so downstream UIs do not have to understand raw
// MongoDB document layout.
function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const MAX_SLUG_WRITE_RETRIES = 3;

function normalizeSlugBase(raw, fallback = "product") {
  const normalized = slugify(raw);
  return normalized || fallback;
}

function isSlugDuplicateError(err) {
  return (
    err?.code === 11000 &&
    (
      err?.keyPattern?.slug === 1 ||
      Object.prototype.hasOwnProperty.call(err?.keyValue || {}, "slug") ||
      String(err?.message || "").toLowerCase().includes("slug")
    )
  );
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeCarePolicy(input = {}) {
  return {
    text: normalizeString(input.text),
  };
}

function normalizeReturnPolicy(input = {}) {
  return normalizeReturnPolicyWithDefaults(input);
}

function normalizeShipping(input = {}) {
  return normalizeShippingWithDefaults(input);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildUniqueProductSlug(baseSlug, { excludeProductId = null } = {}) {
  const normalizedBase = normalizeSlugBase(baseSlug);
  const slugPattern = new RegExp(`^${escapeRegExp(normalizedBase)}(?:-(\\d+))?$`, "i");

  const query = { slug: slugPattern };
  if (excludeProductId && mongoose.isValidObjectId(excludeProductId)) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeProductId) };
  }

  const existing = await Product.find(query).select("slug").lean();
  if (!existing.length) return normalizedBase;

  let hasBase = false;
  let maxSuffix = 1;
  for (const doc of existing) {
    const current = String(doc?.slug || "").trim().toLowerCase();
    if (current === normalizedBase) {
      hasBase = true;
      continue;
    }

    const match = current.match(new RegExp(`^${escapeRegExp(normalizedBase)}-(\\d+)$`));
    if (!match) continue;
    const suffix = Number(match[1]);
    if (Number.isInteger(suffix) && suffix > maxSuffix) maxSuffix = suffix;
  }

  if (!hasBase) return normalizedBase;
  return `${normalizedBase}-${maxSuffix + 1}`;
}

function calculateDiscountedPrice(price, discount) {
  const base = Math.max(0, Number(price || 0));
  const type = String(discount?.type || "none").trim().toLowerCase();
  const value = Math.max(0, Number(discount?.value || 0));

  if (type === "percent") {
    const percent = Math.min(100, value);
    return Math.max(0, base - (base * percent) / 100);
  }
  if (type === "flat") {
    return Math.max(0, base - value);
  }
  return base;
}

function normalizeQueryNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function normalizeDiscountTypeFilter(value) {
  const type = normalizeString(value).toLowerCase();
  return ["none", "percent", "flat"].includes(type) ? type : "";
}

export function buildCommercialFilters(query = {}) {
  const minPrice = normalizeQueryNumber(query.minPrice);
  const maxPrice = normalizeQueryNumber(query.maxPrice);
  const discountMin = normalizeQueryNumber(query.discountMin);
  const discountMax = normalizeQueryNumber(query.discountMax);

  return {
    minPrice,
    maxPrice,
    discountType: normalizeDiscountTypeFilter(query.discountType),
    discountMin,
    discountMax,
  };
}

function hasCommercialFilters(filters = {}) {
  return (
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    !!filters.discountType ||
    filters.discountMin !== null ||
    filters.discountMax !== null
  );
}

function getVariantDiscountSnapshot(variant = {}) {
  const discount = variant?.discount || {};
  return {
    type: normalizeDiscountTypeFilter(discount.type) || "none",
    value: Math.max(0, Number(discount.value || 0)),
  };
}

function getVariantEffectivePrice(variant = {}) {
  return calculateDiscountedPrice(variant?.price, variant?.discount);
}

export function variantMatchesCommercialFilters(variant = {}, filters = {}) {
  const effectivePrice = getVariantEffectivePrice(variant);
  const discount = getVariantDiscountSnapshot(variant);

  if (filters.minPrice !== null && effectivePrice < filters.minPrice) return false;
  if (filters.maxPrice !== null && effectivePrice > filters.maxPrice) return false;
  if (filters.discountType && discount.type !== filters.discountType) return false;
  if (filters.discountMin !== null && discount.value < filters.discountMin) return false;
  if (filters.discountMax !== null && discount.value > filters.discountMax) return false;

  return true;
}

export function buildPriceRange(products = [], variantsByProduct = new Map()) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const product of products) {
    const variants = variantsByProduct.get(String(product?._id || "")) || [];
    for (const variant of variants) {
      const effectivePrice = getVariantEffectivePrice(variant);
      if (!Number.isFinite(effectivePrice)) continue;
      if (effectivePrice < min) min = effectivePrice;
      if (effectivePrice > max) max = effectivePrice;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return {
    min: Math.max(0, Math.floor(min)),
    max: Math.max(0, Math.ceil(max)),
  };
}

function buildAvailability(stock = []) {
  if (!Array.isArray(stock) || !stock.length) return false;
  return stock.some((entry) => Number(entry?.quantity || 0) > 0);
}

function buildColorSummary(variants = []) {
  const seen = new Set();
  const swatches = [];

  for (const variant of variants) {
    const variantColors = Array.isArray(variant?.colors) && variant.colors.length
      ? variant.colors
      : (variant?.color ? [variant.color] : []);

    for (const color of variantColors) {
      const name = normalizeString(color?.name);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const hex = normalizeString(color?.hex);
      swatches.push(hex ? { name, hex } : { name });
    }
  }

  const colorNames = swatches.map((item) => item.name);
  return {
    colorNames,
    swatches,
    hasMultipleColors: colorNames.length > 1,
  };
}

function buildDefaultVariant(variants = []) {
  if (!variants.length) return null;
  const preferred = variants.find((variant) => variant.isDefault) || variants[0];
  const preferredStock = Array.isArray(preferred.stock) && preferred.stock.length ? preferred.stock[0] : null;
  const sizeLabel = normalizeString(preferred?.sizeLabel || "");
  return {
    variantId: preferred._id,
    isDefault: !!preferred.isDefault,
    price: Number(preferred.price || 0),
    effectivePrice: calculateDiscountedPrice(preferred.price, preferred.discount),
    discount: preferred.discount || { type: "none", value: 0, label: "" },
    imageUrl: normalizeString(preferred?.images?.[0]?.url),
    colors: Array.isArray(preferred?.colors) && preferred.colors.length
      ? preferred.colors
      : (preferred?.color ? [preferred.color] : []),
    sizeLabel: sizeLabel || (Array.isArray(preferred.stock) && preferred.stock.length === 1 ? normalizeString(preferredStock?.sizeLabel) : ""),
  };
}

function collectFacetFilters(query = {}) {
  return Object.entries(query || {})
    .filter(([key, value]) => key.startsWith("facet.") && String(value || "").trim())
    .map(([key, value]) => ({
      key: key.slice("facet.".length),
      values: String(value || "")
        .split(",")
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    }))
    .filter((facet) => facet.key && facet.values.length);
}

function normalizeFacetOptionValue(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function resolveCategoryContext(query = {}) {
  if (query.categoryId || query.category) {
    const categoryId = String(query.categoryId || query.category || "").trim();
    if (!mongoose.isValidObjectId(categoryId)) {
      throw new Error("categoryId must be a valid ObjectId");
    }
    const category = await Category.findById(categoryId).select("_id slug").lean();
    if (!category) throw new Error("Category not found");
    return {
      categoryId: String(category._id),
      categorySlug: normalizeString(category.slug).toLowerCase(),
    };
  }

  if (query.categorySlug) {
    const categorySlug = normalizeString(query.categorySlug).toLowerCase();
    if (!categorySlug) return null;
    const category = await Category.findOne({ slug: categorySlug }).select("_id slug").lean();
    if (!category) throw new Error("Category not found");
    return {
      categoryId: String(category._id),
      categorySlug: normalizeString(category.slug).toLowerCase(),
    };
  }

  return null;
}

async function loadCategoryFilterIds(categoryId, { includeDescendants = false } = {}) {
  const rootId = new mongoose.Types.ObjectId(categoryId);
  if (!includeDescendants) return [rootId];

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

function getConfiguredFacetValues(product, variant, field) {
  const rawProductValue = product?.details?.[field.key];
  const rawVariantValue = variant?.details?.[field.key];
  const rawValue = rawVariantValue !== undefined ? rawVariantValue : rawProductValue;

  if (field.type === "enum") {
    if (field.multiValue) {
      return Array.isArray(rawValue)
        ? rawValue.map((item) => normalizeFacetOptionValue(item)).filter(Boolean)
        : [];
    }
    return [normalizeFacetOptionValue(rawValue)].filter(Boolean);
  }

  if (field.type === "boolean") {
    if (rawValue === undefined) return [];
    return [rawValue ? "true" : "false"];
  }

  if (field.type === "number") {
    if (rawValue === undefined || rawValue === null || rawValue === "") return [];
    return [String(rawValue)];
  }

  if (field.multiValue) {
    return Array.isArray(rawValue)
      ? rawValue.map((item) => normalizeFacetOptionValue(item)).filter(Boolean)
      : [];
  }

  return [normalizeFacetOptionValue(rawValue)].filter(Boolean);
}

function getVariantOptionFacetValues(variant, key) {
  if (key === "size") {
    return (Array.isArray(variant?.stock) ? variant.stock : [])
      .map((entry) => normalizeFacetOptionValue(entry?.sizeLabel))
      .filter(Boolean);
  }
  if (key === "color") {
    const colors = Array.isArray(variant?.colors) && variant.colors.length
      ? variant.colors
      : (variant?.color ? [variant.color] : []);
    return colors.map((entry) => normalizeFacetOptionValue(entry?.name)).filter(Boolean);
  }
  return [];
}

function buildFacetDefinitions(config = {}) {
  const productFields = Array.isArray(config?.productFieldDefinitions) ? config.productFieldDefinitions : [];
  const variantFields = Array.isArray(config?.variantFieldDefinitions) ? config.variantFieldDefinitions : [];
  const facetDefs = [
    ...productFields.map((field) => ({ ...field, scope: "product" })),
    ...variantFields.map((field) => ({ ...field, scope: "variant" })),
  ];

  if (config?.variantOptions?.size?.enabled) {
    facetDefs.push({
      key: "size",
      label: "Size",
      type: "enum",
      multiValue: true,
      options: config.variantOptions.size.options || [],
      scope: "variant",
    });
  }

  if (config?.variantOptions?.color?.enabled) {
    facetDefs.push({
      key: "color",
      label: "Color",
      type: "enum",
      multiValue: true,
      options: config.variantOptions.color.options || [],
      scope: "variant",
    });
  }

  return facetDefs;
}

function variantMatchesFacetFilters(product, variant, facetFilters = [], facetDefinitions = []) {
  if (!facetFilters.length) return true;

  const defsByKey = new Map(facetDefinitions.map((field) => [field.key, field]));
  return facetFilters.every((filter) => {
    const definition = defsByKey.get(filter.key);
    if (!definition) return false;
    const values = filter.key === "size" || filter.key === "color"
      ? getVariantOptionFacetValues(variant, filter.key)
      : getConfiguredFacetValues(product, variant, definition);
    if (!values.length) return false;
    return values.some((value) => filter.values.includes(normalizeFacetOptionValue(value)));
  });
}

function buildFacetResponse(products = [], variantsByProduct = new Map(), config = {}, facetFilters = []) {
  const definitions = buildFacetDefinitions(config);
  return definitions
    .map((definition) => {
      const counts = new Map();

      for (const product of products) {
        const variants = variantsByProduct.get(String(product._id)) || [];
        for (const variant of variants) {
          if (!variantMatchesFacetFilters(product, variant, facetFilters, definitions)) continue;
          const values = definition.key === "size" || definition.key === "color"
            ? getVariantOptionFacetValues(variant, definition.key)
            : getConfiguredFacetValues(product, variant, definition);
          for (const value of values) {
            const token = normalizeFacetOptionValue(value);
            if (!token) continue;
            counts.set(token, (counts.get(token) || 0) + 1);
          }
        }
      }

      if (definition.type === "boolean") {
        const trueCount = counts.get("true") || 0;
        if (!trueCount) return null;
        return {
          key: definition.key,
          label: definition.label || definition.key,
          type: "boolean",
          scope: definition.scope || "variant",
          multiSelect: false,
          options: [
            {
              value: "true",
              label: "True",
              count: trueCount,
            },
          ],
        };
      }

      const options = Array.isArray(definition.options) && definition.options.length
        ? definition.options
            .map((option) => {
              const token = normalizeFacetOptionValue(option?.value || option?.label || "");
              return {
                value: token,
                label: normalizeString(option?.label || option?.value || token) || token,
                count: counts.get(token) || 0,
              };
            })
            .filter((option) => option.value)
        : Array.from(counts.entries())
            .map(([value, count]) => ({ value, label: value.replace(/_/g, " "), count }))
            .sort((a, b) => a.label.localeCompare(b.label));

      return {
        key: definition.key,
        label: definition.label || definition.key,
        type: "enum",
        scope: definition.scope || "variant",
        multiSelect: true,
        showOther: false,
        options,
      };
    })
    .filter((facet) => facet && facet.options.length);
}

function buildProductWriteShape(body, { categoryId, details }) {
  return {
    title: normalizeString(body.title),
    description: normalizeString(body.description),
    shortDescription: normalizeString(body.shortDescription),
    categoryId: new mongoose.Types.ObjectId(categoryId),
    tags: normalizeStringArray(body.tags),
    currency: normalizeString(body.currency || "INR", "INR"),
    images: Array.isArray(body.images) ? body.images : [],
    shipping: normalizeShipping(body.shipping),
    care: normalizeCarePolicy(body.care),
    returnPolicy: normalizeReturnPolicy(body.returnPolicy),
    details,
    isActive: body.isActive !== undefined ? !!body.isActive : true,
    isFeatured: !!body.isFeatured,
    createdBy: body.createdBy || null,
    updatedBy: body.updatedBy || null,
  };
}

async function validateDetailsAgainstCategory(categoryId, details) {
  const { resolvedConfig } = await getCategoryDefinitionConfig(categoryId);
  const result = validateProductDetails(details || {}, resolvedConfig.productFieldDefinitions || []);
  return {
    resolvedConfig,
    normalizedDetails: result.normalized,
    errors: result.errors,
  };
}

async function loadActiveVariantsByProductIds(productIds = []) {
  if (!productIds.length) return new Map();
  const variants = await Variant.find({ productId: { $in: productIds }, isActive: true })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();

  const byProduct = new Map();
  for (const variant of variants) {
    const key = String(variant.productId);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(variant);
  }
  return byProduct;
}

async function loadCategorySlugsById(products = []) {
  const categoryIds = Array.from(
    new Set(
      products
        .map((product) => String(product?.categoryId || "").trim())
        .filter(Boolean)
    )
  ).filter((id) => mongoose.isValidObjectId(id));

  if (!categoryIds.length) return new Map();

  const categories = await Category.find({ _id: { $in: categoryIds } })
    .select("_id slug")
    .lean();

  return new Map(
    categories.map((category) => [
      String(category._id),
      normalizeString(category.slug).toLowerCase(),
    ])
  );
}

async function listProducts(query, { audience = "storefront" } = {}) {
  const page = normalizePositiveInteger(query.page, 1);
  const limit = normalizePositiveInteger(query.limit, 20);
  const match = {};
  const categoryContext = await resolveCategoryContext(query);
  const facetFilters = collectFacetFilters(query);
  const commercialFilters = buildCommercialFilters(query);
  const includeDescendants = audience === "admin";

  if (query.isActive === "all") {
    // admin keeps all
  } else if (query.isActive === undefined) {
    match.isActive = true;
  } else {
    match.isActive = query.isActive === "true";
  }

  if (categoryContext?.categoryId) {
    const categoryIds = await loadCategoryFilterIds(categoryContext.categoryId, { includeDescendants });
    match.categoryId = categoryIds.length === 1 ? categoryIds[0] : { $in: categoryIds };
  }

  if (query.q && String(query.q).trim()) {
    match.$text = { $search: String(query.q).trim() };
  }

  if (query.featured !== undefined) {
    const featured = String(query.featured).toLowerCase();
    match.isFeatured = featured === "true" || featured === "1" || featured === "yes";
  }

  const products = await Product.find(match)
    .sort({ createdAt: -1 })
    .lean();

  const variantsByProduct = await loadActiveVariantsByProductIds(products.map((product) => product._id));
  const categoryConfig = categoryContext?.categoryId
    ? await getCategoryDefinitionConfig(categoryContext.categoryId)
    : { resolvedConfig: {} };
  const facetDefinitions = buildFacetDefinitions(categoryConfig.resolvedConfig || {});

  const filteredProducts = products
    .map((product) => {
      const variants = (variantsByProduct.get(String(product._id)) || [])
        .filter((variant) => variantMatchesFacetFilters(product, variant, facetFilters, facetDefinitions))
        .filter((variant) => variantMatchesCommercialFilters(variant, commercialFilters));
      if (!variants.length && (facetFilters.length || hasCommercialFilters(commercialFilters))) return null;
      return { product, variants };
    })
    .filter(Boolean);

  const total = filteredProducts.length;
  const totalPages = total ? Math.ceil(total / limit) : 1;
  const paginatedProducts = filteredProducts
    .slice((page - 1) * limit, (page - 1) * limit + limit);
  const categorySlugById = await loadCategorySlugsById(paginatedProducts.map(({ product }) => product));

  const items = paginatedProducts.map(({ product, variants }) => {
    const defaultVariant = buildDefaultVariant(variants);
    const colorSummary = buildColorSummary(variants);
    const otherVariantColors = colorSummary.swatches.slice(1);
    const availability = variants.some((variant) => buildAvailability(variant.stock));

    if (audience === "admin") {
      return mapAdminListItem(product, {
        defaultVariant,
        colorSummary,
        care: product.care,
        returnPolicy: product.returnPolicy,
      });
    }

    return mapStorefrontListItem(product, {
      defaultVariant,
      categorySlug: categorySlugById.get(String(product.categoryId)) || categoryContext?.categorySlug || "",
      care: product.care,
      returnPolicy: product.returnPolicy,
      availability,
      colorSummary,
      otherVariantColors,
    });
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function create(req, res) {
  try {
    const body = req.body || {};
    const categoryId = String(body.categoryId || "").trim();
    const baseSlug = normalizeSlugBase(normalizeString(body.slug) || normalizeString(body.title), "product");

    const detailValidation = await validateDetailsAgainstCategory(categoryId, body.details);
    if (detailValidation.errors.length) {
      return res.status(400).json({ error: detailValidation.errors.join("; ") });
    }

    const productDraft = buildProductWriteShape(body, {
      categoryId,
      details: detailValidation.normalizedDetails,
    });
    productDraft.createdBy = req.user?._id || null;
    productDraft.updatedBy = req.user?._id || null;

    let lastError = null;
    for (let attempt = 0; attempt < MAX_SLUG_WRITE_RETRIES; attempt += 1) {
      productDraft.slug = await buildUniqueProductSlug(baseSlug);
      try {
        const doc = await Product.create(productDraft);
        return res.status(201).json(doc);
      } catch (err) {
        if (isSlugDuplicateError(err) && attempt < MAX_SLUG_WRITE_RETRIES - 1) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (isSlugDuplicateError(lastError)) {
      return res.status(409).json({ error: "Product slug already exists" });
    }
    throw lastError || new Error("Failed to create product");
  } catch (err) {
    if (isSlugDuplicateError(err)) return res.status(409).json({ error: "Product slug already exists" });
    res.status(500).json({ error: err.message || "Failed to create product" });
  }
}

export async function list(req, res) {
  try {
    const result = await listProducts(req.query, { audience: "storefront" });
    res.json(result.items);
  } catch (err) {
    if (String(err?.message || "").includes("categoryId must be a valid ObjectId")) {
      return res.status(400).json({ error: "categoryId must be a valid ObjectId" });
    }
    if (String(err?.message || "").includes("Category not found")) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.status(500).json({ error: err.message || "Failed to list products" });
  }
}

export async function adminList(req, res) {
  try {
    const result = await listProducts({
      ...req.query,
      isActive: req.query.isActive === undefined ? "all" : req.query.isActive,
    }, { audience: "admin" });
    res.json(result);
  } catch (err) {
    if (String(err?.message || "").includes("categoryId must be a valid ObjectId")) {
      return res.status(400).json({ error: "categoryId must be a valid ObjectId" });
    }
    if (String(err?.message || "").includes("Category not found")) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.status(500).json({ error: err.message || "Failed to list products" });
  }
}

export async function facets(req, res) {
  try {
    const categoryContext = await resolveCategoryContext(req.query);
    if (!categoryContext?.categoryId) {
      return res.json({ categoryId: "", categorySlug: "", priceRange: null, facets: [] });
    }

    const products = await Product.find({
      isActive: true,
      categoryId: new mongoose.Types.ObjectId(categoryContext.categoryId),
    })
      .select("categoryId details")
      .lean();
    const variantsByProduct = await loadActiveVariantsByProductIds(products.map((product) => product._id));
    const categoryConfig = await getCategoryDefinitionConfig(categoryContext.categoryId);
    const facetFilters = collectFacetFilters(req.query);
    const commercialFilters = buildCommercialFilters(req.query);
    const priceRange = buildPriceRange(products, variantsByProduct);
    const commerciallyFilteredVariantsByProduct = new Map(
      products.map((product) => [
        String(product._id),
        (variantsByProduct.get(String(product._id)) || []).filter((variant) =>
          variantMatchesCommercialFilters(variant, commercialFilters)
        ),
      ])
    );
    const facetsPayload = buildFacetResponse(
      products,
      commerciallyFilteredVariantsByProduct,
      categoryConfig.resolvedConfig || {},
      facetFilters
    );

    return res.json({
      categoryId: categoryContext.categoryId,
      categorySlug: categoryContext.categorySlug,
      priceRange,
      facets: facetsPayload,
    });
  } catch (err) {
    if (String(err?.message || "").includes("categoryId must be a valid ObjectId")) {
      return res.status(400).json({ error: "categoryId must be a valid ObjectId" });
    }
    if (String(err?.message || "").includes("Category not found")) {
      return res.status(404).json({ error: "Category not found" });
    }
    return res.status(500).json({ error: err.message || "Failed to load facets" });
  }
}

export async function adminFacets(req, res) {
  return facets(req, res);
}

export async function adminGetById(req, res) {
  try {
    const doc = await Product.findById(req.params.id)
      .select("title slug description shortDescription categoryId currency tags images shipping care returnPolicy details isFeatured isActive")
      .lean();
    if (!doc) return res.status(404).json({ error: "Product not found" });
    return res.json(mapAdminProductDetail(doc));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch product" });
  }
}

export async function listByCategorySlug(req, res) {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const category = await Category.findOne({ slug }).lean();
    if (!category) return res.status(404).json({ error: "Category not found" });
    const result = await listProducts({ ...req.query, categoryId: category._id.toString() }, { audience: "storefront" });
    res.json(result.items);
  } catch (err) {
    if (String(err?.message || "").includes("categoryId must be a valid ObjectId")) {
      return res.status(400).json({ error: "categoryId must be a valid ObjectId" });
    }
    res.status(500).json({ error: err.message || "Failed to list products" });
  }
}

export async function getBySlug(req, res) {
  try {
    const doc = await Product.findOne({ slug: String(req.params.slug).toLowerCase() })
      .select("title slug description shortDescription currency images shipping care returnPolicy details categoryId")
      .lean();
    if (!doc) return res.status(404).json({ error: "Product not found" });

    const category = doc.categoryId
      ? await Category.findById(doc.categoryId).select("slug").lean()
      : null;

    const variants = await Variant.find({ productId: doc._id, isActive: true })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    const variantsWithComputed = variants.map((variant) => ({
      variant,
      computed: {
        effectivePrice: calculateDiscountedPrice(variant.price, variant.discount),
        stock: Array.isArray(variant.stock) ? variant.stock : [],
        availability: buildAvailability(variant.stock),
      },
    }));

    const availability = variants.some((variant) => buildAvailability(variant.stock));
    const colorSummary = buildColorSummary(variants);
    const otherVariantColors = colorSummary.swatches.slice(1);

    res.json(
      mapStorefrontProductDetail(doc, {
        variants: variantsWithComputed,
        categorySlug: normalizeString(category?.slug).toLowerCase(),
        defaultVariant: buildDefaultVariant(variants),
        availability,
        colorSummary,
        otherVariantColors,
      })
    );
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch product" });
  }
}

export async function update(req, res) {
  try {
    const body = req.body || {};
    const existing = await Product.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: "Product not found" });

    const categoryId = hasOwn(body, "categoryId")
      ? String(body.categoryId || "").trim()
      : String(existing.categoryId || "").trim();

    const mergedDetails = hasOwn(body, "details")
      ? { ...(existing.details || {}), ...(body.details || {}) }
      : (existing.details || {});
    const detailValidation = await validateDetailsAgainstCategory(categoryId, mergedDetails);
    if (detailValidation.errors.length) {
      return res.status(400).json({ error: detailValidation.errors.join("; ") });
    }

    const patch = {};
    if (hasOwn(body, "title")) patch.title = normalizeString(body.title);
    if (hasOwn(body, "description")) patch.description = normalizeString(body.description);
    if (hasOwn(body, "shortDescription")) patch.shortDescription = normalizeString(body.shortDescription);
    if (hasOwn(body, "categoryId")) patch.categoryId = new mongoose.Types.ObjectId(categoryId);
    if (hasOwn(body, "tags")) patch.tags = normalizeStringArray(body.tags);
    if (hasOwn(body, "currency")) patch.currency = normalizeString(body.currency || "INR", "INR");
    if (hasOwn(body, "images")) patch.images = Array.isArray(body.images) ? body.images : [];
    if (hasOwn(body, "shipping")) patch.shipping = normalizeShipping(body.shipping);
    if (hasOwn(body, "care")) patch.care = normalizeCarePolicy(body.care);
    if (hasOwn(body, "returnPolicy")) patch.returnPolicy = normalizeReturnPolicy(body.returnPolicy);
    if (hasOwn(body, "details")) patch.details = detailValidation.normalizedDetails;
    if (hasOwn(body, "isActive")) patch.isActive = !!body.isActive;
    if (hasOwn(body, "isFeatured")) patch.isFeatured = !!body.isFeatured;
    patch.updatedBy = req.user?._id || null;

    const hasSlugInput = hasOwn(body, "slug");
    const requestedSlug = hasSlugInput ? slugify(body.slug) : "";
    const incomingTitle = hasOwn(body, "title") ? normalizeString(body.title) : normalizeString(existing.title);
    const titleChanged = hasOwn(body, "title") && normalizeString(existing.title) !== incomingTitle;
    let slugBaseForRetry = "";

    if (hasSlugInput && requestedSlug) {
      slugBaseForRetry = requestedSlug;
      patch.slug = await buildUniqueProductSlug(slugBaseForRetry, { excludeProductId: req.params.id });
    } else if (titleChanged) {
      slugBaseForRetry = incomingTitle;
      patch.slug = await buildUniqueProductSlug(slugBaseForRetry, { excludeProductId: req.params.id });
    }

    let doc = null;
    let lastError = null;
    for (let attempt = 0; attempt < MAX_SLUG_WRITE_RETRIES; attempt += 1) {
      try {
        doc = await Product.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
        break;
      } catch (err) {
        if (isSlugDuplicateError(err) && patch.slug && attempt < MAX_SLUG_WRITE_RETRIES - 1) {
          patch.slug = await buildUniqueProductSlug(slugBaseForRetry || patch.slug, { excludeProductId: req.params.id });
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (!doc) {
      if (isSlugDuplicateError(lastError)) return res.status(409).json({ error: "Product slug already exists" });
      throw lastError || new Error("Failed to update product");
    }

    res.json(doc);
  } catch (err) {
    if (isSlugDuplicateError(err)) return res.status(409).json({ error: "Product slug already exists" });
    res.status(500).json({ error: err.message || "Failed to update product" });
  }
}

export async function softDelete(req, res) {
  try {
    const productId = req.params.id;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "productId must be a valid ObjectId" });
    }

    const product = await Product.findById(productId).select("_id").lean();
    if (!product) return res.status(404).json({ error: "Product not found" });

    const variants = await Variant.find({ productId }).select("_id").lean();
    const variantIds = variants.map((variant) => variant._id);

    const [inventoryResult, variantResult, productResult] = await Promise.all([
      Inventory.deleteMany({
        $or: [
          { productId },
          ...(variantIds.length ? [{ variantId: { $in: variantIds } }] : []),
        ],
      }),
      Variant.deleteMany({ productId }),
      Product.deleteOne({ _id: productId }),
    ]);

    if (!productResult?.deletedCount) {
      return res.status(500).json({ error: "Failed to delete product" });
    }

    res.json({
      success: true,
      deleted: {
        products: Number(productResult.deletedCount || 0),
        variants: Number(variantResult.deletedCount || 0),
        inventory: Number(inventoryResult.deletedCount || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete product" });
  }
}

export async function publish(req, res) {
  try {
    const { isActive } = req.body;
    const doc = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: !!isActive, updatedBy: req.user?._id || null },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Product not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to publish/unpublish" });
  }
}
