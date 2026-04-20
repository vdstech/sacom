import type { ProductDetail, StoreDiscount } from "@/lib/storeApi";

const STORAGE_KEY = "siri_recently_viewed";
const MAX_RECENT_ITEMS = 8;

export type RecentlyViewedEntry = {
  productId: string;
  slug: string;
  title: string;
  imageUrl?: string;
  price?: number;
  effectivePrice?: number;
  discount?: StoreDiscount;
  categorySlug?: string;
};

function readEntries(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: RecentlyViewedEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENT_ITEMS)));
}

export function rememberProduct(product: ProductDetail) {
  if (typeof window === "undefined" || !product?._id || !product?.slug) return;
  const entry: RecentlyViewedEntry = {
    productId: product._id,
    slug: product.slug,
    title: product.title,
    imageUrl: product.defaultVariant?.imageUrl,
    price: product.defaultVariant?.price,
    effectivePrice: product.defaultVariant?.effectivePrice,
    discount: product.defaultVariant?.discount,
    categorySlug: product.categorySlug,
  };
  const next = [entry, ...readEntries().filter((item) => item.productId !== entry.productId)];
  writeEntries(next);
}

export function getRecentlyViewed(categorySlug = "", excludeProductId = "") {
  const normalizedCategorySlug = String(categorySlug || "").trim().toLowerCase();
  return readEntries().filter((entry) =>
    (!excludeProductId || entry.productId !== excludeProductId) &&
    (!normalizedCategorySlug || String(entry.categorySlug || "").trim().toLowerCase() === normalizedCategorySlug)
  );
}
