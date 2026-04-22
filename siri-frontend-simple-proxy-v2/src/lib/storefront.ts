import { StoreRequestError, type StoreCategoryNode } from "@/lib/storeApi";
import type { UiNode } from "@/lib/types";

export const PRIMARY_MERCH_CATEGORY_SLUG = "blouse";
export const LIVE_CATEGORY_SLUGS = new Set(["blouse", "mangalsutra", "printed-sarees"]);

export function normalizeCategorySlug(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isLiveCategorySlug(value: unknown) {
  return LIVE_CATEGORY_SLUGS.has(normalizeCategorySlug(value));
}

export function isPrimaryMerchCategorySlug(value: unknown) {
  return normalizeCategorySlug(value) === PRIMARY_MERCH_CATEGORY_SLUG;
}

function normalizePath(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function categoryHref(node: Pick<StoreCategoryNode, "path" | "slug">) {
  const raw = String(node.path || node.slug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return raw ? `/c/${raw}` : "/c";
}

export function flattenCategories(nodes: StoreCategoryNode[] = [], out: StoreCategoryNode[] = []) {
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) flattenCategories(node.children, out);
  }
  return out;
}

export function findCategoryNodeByPath(nodes: StoreCategoryNode[] = [], path: string) {
  const expectedPath = normalizePath(path);
  return flattenCategories(nodes, []).find((node) => normalizePath(categoryHref(node)) === expectedPath) || null;
}

export function findCategoryNodeBySlug(nodes: StoreCategoryNode[] = [], slug: string) {
  const expectedSlug = normalizeCategorySlug(slug);
  return flattenCategories(nodes, []).find((node) => normalizeCategorySlug(node.slug) === expectedSlug) || null;
}

export function findFirstLiveCategoryNode(nodes: StoreCategoryNode[] = []) {
  return flattenCategories(nodes, []).find((node) => isLiveCategorySlug(node.slug)) || null;
}

export function findPrimaryMerchCategoryNode(nodes: StoreCategoryNode[] = []) {
  return flattenCategories(nodes, []).find((node) => isPrimaryMerchCategorySlug(node.slug)) || null;
}

export function mapCategoryTree(tree: StoreCategoryNode[] = []): UiNode[] {
  return tree.map((node) => ({
    id: node._id,
    label: node.name,
    href: categoryHref(node),
    categorySlug: node.slug,
    isLiveCategory: isLiveCategorySlug(node.slug),
    children: node.children?.length ? mapCategoryTree(node.children) : undefined,
  }));
}

export function toErrorMessage(error: unknown, fallback = "Unexpected storefront error") {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const message = String(error || "").trim();
  return message || fallback;
}

export function isNotFoundError(error: unknown) {
  return error instanceof StoreRequestError && error.status === 404;
}

export function toTechnicalBannerMessage(error: unknown, fallback = "Storefront data is temporarily unavailable.") {
  if (error instanceof StoreRequestError) {
    const detail = String(error.detail || error.message || "").trim();
    return detail ? `${fallback} ${detail}` : fallback;
  }

  const detail = toErrorMessage(error, "");
  return detail ? `${fallback} ${detail}` : fallback;
}
