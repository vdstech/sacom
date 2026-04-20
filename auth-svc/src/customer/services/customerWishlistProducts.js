import StorefrontProductRead from "../models/storefrontProductReadModel.js";
import StorefrontVariantRead from "../models/storefrontVariantReadModel.js";

function calculateDiscountedPrice(price, discount) {
  const base = Math.max(0, Number(price || 0));
  const type = String(discount?.type || "none").trim().toLowerCase();
  const value = Math.max(0, Number(discount?.value || 0));
  if (!base) return 0;
  if (type === "percent") return Math.max(0, Math.round((base * (100 - Math.min(value, 100))) / 100));
  if (type === "flat") return Math.max(0, Math.round(base - value));
  return base;
}

function compareVariants(a, b) {
  if (!!a?.isDefault !== !!b?.isDefault) return a?.isDefault ? -1 : 1;
  return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
}

function toWishlistItem(product, variant) {
  const imageUrl = String(variant?.images?.[0]?.url || product?.images?.[0]?.url || "").trim();
  const price = Number(variant?.price || 0);
  return {
    _id: String(product?._id || ""),
    title: String(product?.title || ""),
    slug: String(product?.slug || ""),
    shortDescription: String(product?.shortDescription || ""),
    defaultVariant: {
      variantId: variant?._id ? String(variant._id) : "",
      price,
      effectivePrice: calculateDiscountedPrice(price, variant?.discount),
      discount: variant?.discount || { type: "none", value: 0, label: "" },
      imageUrl,
      colors: Array.isArray(variant?.colors) ? variant.colors : [],
      sizeLabel: String(variant?.sizeLabel || ""),
    },
  };
}

export async function buildWishlistProducts(productIds = []) {
  const normalizedIds = productIds.map((value) => String(value || "").trim()).filter(Boolean);
  if (!normalizedIds.length) return [];

  const products = await StorefrontProductRead.find({ _id: { $in: normalizedIds }, isActive: true })
    .select("_id title slug shortDescription images")
    .lean();
  if (!products.length) return [];

  const variants = await StorefrontVariantRead.find({
    productId: { $in: products.map((product) => product._id) },
    isActive: true,
  })
    .select("_id productId price discount images colors sizeLabel isDefault createdAt")
    .lean();

  const variantsByProduct = new Map();
  for (const variant of variants) {
    const key = String(variant?.productId || "");
    const current = variantsByProduct.get(key);
    if (!current || compareVariants(variant, current) < 0) variantsByProduct.set(key, variant);
  }

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  return normalizedIds
    .map((id) => {
      const product = productMap.get(id);
      if (!product) return null;
      return toWishlistItem(product, variantsByProduct.get(id) || null);
    })
    .filter(Boolean);
}
