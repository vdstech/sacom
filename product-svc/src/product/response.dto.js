function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value) {
  return String(value ?? "").trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeString(value) {
  const text = asTrimmedString(value);
  return text || undefined;
}

function sanitizeImageList(images = []) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => {
      const url = asTrimmedString(image?.url);
      if (!url) return null;
      const out = { url };
      const alt = sanitizeString(image?.alt);
      if (alt !== undefined) out.alt = alt;
      const sortOrder = Number(image?.sortOrder);
      if (Number.isFinite(sortOrder)) out.sortOrder = sortOrder;
      return out;
    })
    .filter(Boolean);
}

function sanitizeDiscount(discount = {}) {
  const type = asTrimmedString(discount?.type || "none").toLowerCase();
  const safeType = ["none", "percent", "flat"].includes(type) ? type : "none";
  const value = Math.max(0, asNumber(discount?.value, 0));
  const label = asTrimmedString(discount?.label);
  return {
    type: safeType,
    value: safeType === "percent" ? Math.min(100, value) : (safeType === "none" ? 0 : value),
    label,
  };
}

function sanitizeReturnPolicy(policy = {}) {
  if (!isPlainObject(policy)) return null;
  const text = asTrimmedString(policy.text);
  const returnable = policy.returnable === undefined ? undefined : !!policy.returnable;
  const windowDays = Math.max(0, asNumber(policy.windowDays, 0));
  const type = asTrimmedString(policy.type);
  const notes = asTrimmedString(policy.notes);
  const derived = joinLegacyLines([
    returnable === undefined ? "" : (returnable ? "Return / exchange available" : "Not returnable"),
    returnable ? (windowDays > 0 ? `Return window: ${windowDays} days` : "") : "",
    type && type !== "none" ? `Policy type: ${type}` : "",
    notes,
  ]);
  return {
    text: text || derived,
    returnable: !!returnable,
    windowDays: returnable ? Math.max(1, windowDays) : 0,
  };
}

function joinLegacyLines(values = []) {
  return values
    .map((value) => asTrimmedString(value))
    .filter(Boolean)
    .join("\n");
}

function sanitizeCarePolicy(policy = {}) {
  if (!isPlainObject(policy)) return null;
  const legacyWashCare = Array.isArray(policy.washCare)
    ? policy.washCare.map((value) => asTrimmedString(value)).filter(Boolean).join(", ")
    : "";
  return {
    text: asTrimmedString(policy.text) || joinLegacyLines([
      legacyWashCare,
      policy.ironCare,
      policy.bleach,
      policy.dryClean,
      policy.dryInstructions,
    ]),
  };
}

function sanitizeShipping(shipping = {}) {
  if (!isPlainObject(shipping)) return {};
  return {
    text: asTrimmedString(shipping.text) || joinLegacyLines([
      shipping.dispatchWindow,
      shipping.deliveryEta,
      shipping.shippingChargeText,
      shipping.note,
    ]),
  };
}

function sanitizeDetails(details = {}) {
  if (!isPlainObject(details)) return {};
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const items = value
        .map((item) => typeof item === "number" ? item : asTrimmedString(item))
        .filter((item) => item !== "" && item !== undefined);
      if (items.length) out[key] = items;
      continue;
    }
    if (typeof value === "string") {
      const text = asTrimmedString(value);
      if (text) out[key] = text;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeColor(color = {}) {
  if (!isPlainObject(color)) return null;
  const name = asTrimmedString(color.name);
  if (!name) return null;
  const hex = asTrimmedString(color.hex);
  return hex ? { name, hex } : { name };
}

function sanitizeColors(colors = [], legacyColor = null) {
  const raw = Array.isArray(colors) && colors.length
    ? colors
    : (legacyColor ? [legacyColor] : []);
  const seen = new Set();
  const normalized = [];

  for (const entry of raw) {
    const color = sanitizeColor(entry);
    const key = asTrimmedString(color?.name).toLowerCase();
    if (!color || !key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(color);
  }

  return normalized;
}

function sanitizeStockEntries(stock = []) {
  if (!Array.isArray(stock)) return [];
  return stock
    .map((entry) => {
      const stockKey = asTrimmedString(entry?.stockKey);
      if (!stockKey) return null;
      return {
        stockKey,
        sizeLabel: asTrimmedString(entry?.sizeLabel),
        quantity: Math.max(0, asNumber(entry?.quantity, 0)),
        reorderLevel: Math.max(0, asNumber(entry?.reorderLevel, 0)),
      };
    })
    .filter(Boolean);
}

function sanitizeVariantSizeLabel(variant = {}) {
  const direct = asTrimmedString(variant.sizeLabel);
  if (direct) return direct;
  const stock = sanitizeStockEntries(variant.stock);
  return stock.length === 1 ? asTrimmedString(stock[0]?.sizeLabel) : "";
}

function sanitizeDefaultVariant(variant) {
  if (!isPlainObject(variant)) return null;
  return {
    variantId: variant.variantId || null,
    isDefault: !!variant.isDefault,
    price: asNumber(variant.price, 0),
    effectivePrice: asNumber(variant.effectivePrice, asNumber(variant.price, 0)),
    discount: sanitizeDiscount(variant.discount),
    imageUrl: asTrimmedString(variant.imageUrl),
    colors: sanitizeColors(variant.colors, variant.color),
    sizeLabel: sanitizeVariantSizeLabel(variant),
  };
}

function sanitizeColorSummary(input = {}) {
  return {
    colorNames: Array.isArray(input?.colorNames)
      ? input.colorNames.map((value) => asTrimmedString(value)).filter(Boolean)
      : [],
    swatches: Array.isArray(input?.swatches)
      ? input.swatches
          .map((swatch) => sanitizeColor(swatch))
          .filter(Boolean)
      : [],
    hasMultipleColors: !!input?.hasMultipleColors,
  };
}

function sanitizeOtherVariantColors(colors = []) {
  if (!Array.isArray(colors)) return [];
  return colors.map((swatch) => sanitizeColor(swatch)).filter(Boolean);
}

export function mapStorefrontListItem(product = {}, computed = {}) {
  return {
    _id: product._id,
    title: asTrimmedString(product.title),
    slug: asTrimmedString(product.slug),
    categoryId: asTrimmedString(product.categoryId),
    categorySlug: asTrimmedString(computed.categorySlug),
    shortDescription: asTrimmedString(product.shortDescription),
    currency: asTrimmedString(product.currency || "INR") || "INR",
    defaultVariant: sanitizeDefaultVariant(computed.defaultVariant),
    care: sanitizeCarePolicy(computed.care),
    returnPolicy: sanitizeReturnPolicy(computed.returnPolicy),
    availability: !!computed.availability,
    colorSummary: sanitizeColorSummary(computed.colorSummary),
    otherVariantColors: sanitizeOtherVariantColors(computed.otherVariantColors),
  };
}

export function mapAdminListItem(product = {}, computed = {}) {
  return {
    _id: product._id,
    title: asTrimmedString(product.title),
    slug: asTrimmedString(product.slug),
    isActive: !!product.isActive,
    isFeatured: !!product.isFeatured,
    defaultVariant: sanitizeDefaultVariant(computed.defaultVariant),
    colorSummary: sanitizeColorSummary(computed.colorSummary),
    care: sanitizeCarePolicy(computed.care),
    returnPolicy: sanitizeReturnPolicy(computed.returnPolicy),
  };
}

export function mapAdminProductDetail(product = {}) {
  return {
    _id: product._id,
    title: asTrimmedString(product.title),
    slug: asTrimmedString(product.slug),
    description: asTrimmedString(product.description),
    shortDescription: asTrimmedString(product.shortDescription),
    categoryId: asTrimmedString(product.categoryId),
    currency: asTrimmedString(product.currency || "INR") || "INR",
    tags: Array.isArray(product.tags) ? product.tags.map((item) => asTrimmedString(item)).filter(Boolean) : [],
    images: sanitizeImageList(product.images),
    shipping: sanitizeShipping(product.shipping),
    care: sanitizeCarePolicy(product.care),
    returnPolicy: sanitizeReturnPolicy(product.returnPolicy),
    details: sanitizeDetails(product.details),
    isFeatured: !!product.isFeatured,
    isActive: !!product.isActive,
  };
}

export function mapStorefrontVariant(variant = {}, computed = {}) {
  return {
    _id: variant._id,
    price: asNumber(variant.price, 0),
    effectivePrice: asNumber(computed.effectivePrice, asNumber(variant.price, 0)),
    discount: sanitizeDiscount(variant.discount),
    isDefault: !!variant.isDefault,
    isActive: !!variant.isActive,
    images: sanitizeImageList(variant.images),
    colors: sanitizeColors(variant.colors, variant.color),
    sizeLabel: sanitizeVariantSizeLabel(variant),
    details: sanitizeDetails(variant.details),
    stock: sanitizeStockEntries(computed.stock || variant.stock),
    availability: !!computed.availability,
  };
}

export function mapStorefrontProductDetail(product = {}, computed = {}) {
  return {
    _id: product._id,
    title: asTrimmedString(product.title),
    slug: asTrimmedString(product.slug),
    categoryId: asTrimmedString(product.categoryId),
    categorySlug: asTrimmedString(computed.categorySlug),
    description: asTrimmedString(product.description),
    shortDescription: asTrimmedString(product.shortDescription),
    currency: asTrimmedString(product.currency || "INR") || "INR",
    images: sanitizeImageList(product.images),
    shipping: sanitizeShipping(product.shipping),
    care: sanitizeCarePolicy(product.care),
    returnPolicy: sanitizeReturnPolicy(product.returnPolicy),
    details: sanitizeDetails(product.details),
    variants: Array.isArray(computed.variants)
      ? computed.variants.map((variant) => mapStorefrontVariant(variant.variant, variant.computed))
      : [],
    defaultVariant: sanitizeDefaultVariant(computed.defaultVariant),
    availability: !!computed.availability,
    colorSummary: sanitizeColorSummary(computed.colorSummary),
    otherVariantColors: sanitizeOtherVariantColors(computed.otherVariantColors),
  };
}

export function mapAdminVariantListItem(variant = {}, computed = {}) {
  return {
    _id: variant._id,
    productId: variant.productId,
    price: asNumber(variant.price, 0),
    discount: sanitizeDiscount(variant.discount),
    images: sanitizeImageList(variant.images),
    colors: sanitizeColors(variant.colors, variant.color),
    sizeLabel: sanitizeVariantSizeLabel(variant),
    details: sanitizeDetails(variant.details),
    stock: sanitizeStockEntries(computed.stock || variant.stock),
    isDefault: !!variant.isDefault,
    isActive: !!variant.isActive,
  };
}
