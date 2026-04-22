import { DEFAULT_GATEWAY_INTERNAL_URL } from "@/lib/constants";

export type CarePolicy = {
  text?: string;
};

export type ReturnPolicy = {
  text?: string;
  returnable?: boolean;
  windowDays?: number;
};

export type NavCategory = {
  _id?: string;
  name?: string;
  slug?: string;
  path?: string;
};

export type StoreCategoryNode = {
  _id: string;
  name: string;
  slug?: string;
  path?: string;
  parent?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  children?: StoreCategoryNode[];
};

export type CategoryFacet = {
  key: string;
  label: string;
  type: "enum" | "boolean" | string;
  scope?: string;
  multiSelect?: boolean;
  options: Array<{
    value: string;
    label: string;
    count: number;
  }>;
};

export type StorePriceRange = {
  min: number;
  max: number;
};

export type StoreDiscount = {
  type?: "none" | "percent" | "flat" | string;
  value?: number;
  label?: string;
};

export type ProductListItem = {
  _id: string;
  title: string;
  slug: string;
  categoryId?: string;
  categorySlug?: string;
  shortDescription?: string;
  care?: CarePolicy | null;
  returnPolicy?: ReturnPolicy | null;
  availability?: boolean;
  defaultVariant?: {
    variantId?: string;
    price?: number;
    effectivePrice?: number;
    discount?: StoreDiscount;
    imageUrl?: string;
    colors?: Array<{ name?: string; hex?: string }>;
    sizeLabel?: string;
  } | null;
};

export type ProductVariant = {
  _id: string;
  price?: number;
  effectivePrice?: number;
  discount?: StoreDiscount;
  isDefault?: boolean;
  isActive?: boolean;
  images?: Array<{ url?: string; alt?: string; sortOrder?: number }>;
  colors?: Array<{ name?: string; hex?: string }>;
  sizeLabel?: string;
  details?: Record<string, unknown>;
  stock?: Array<{
    stockKey?: string;
    sizeLabel?: string;
    quantity?: number;
    reorderLevel?: number;
  }>;
  availability?: boolean;
};

export type ProductDetail = ProductListItem & {
  description?: string;
  currency?: string;
  categorySlug?: string;
  shipping?: {
    text?: string;
  };
  details?: Record<string, unknown>;
  images?: Array<{ url?: string; alt?: string; sortOrder?: number }>;
  variants?: ProductVariant[];
};

export type CartItem = {
  itemId: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  variantId: string;
  stockKey: string;
  sizeLabel?: string;
  colorName?: string;
  imageUrl?: string;
  unitPrice: number;
  effectivePrice: number;
  quantity: number;
  available: boolean;
  lineTotal: number;
};

export type CartResponse = {
  cartToken: string;
  itemCount: number;
  subtotal: number;
  items: CartItem[];
  expiresAt?: string;
  warnings?: Array<{
    type?: string;
    itemId?: string;
    message?: string;
  }>;
};

export class StoreRequestError extends Error {
  status?: number;
  detail?: string;
  kind: "http" | "network";

  constructor(message: string, options: { kind: "http" | "network"; status?: number; detail?: string }) {
    super(message);
    this.name = "StoreRequestError";
    this.kind = options.kind;
    this.status = options.status;
    this.detail = options.detail;
  }
}

function resolveStoreBaseUrl() {
  if (typeof window !== "undefined") return "/api/proxy";

  const baseUrl = String(process.env.GATEWAY_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (baseUrl) return baseUrl;

  return DEFAULT_GATEWAY_INTERNAL_URL;
}

export async function fetchStore<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = resolveStoreBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { cache: "no-store", ...(init || {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new StoreRequestError(`Store API request failed before response: ${message}`, {
      kind: "network",
      detail: message,
    });
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = String(payload?.error || payload?.message || "").trim();
    } catch {
      try {
        detail = String(await response.text()).trim();
      } catch {
        detail = "";
      }
    }
    throw new StoreRequestError(
      detail
        ? `Store API request failed (${response.status}): ${detail}`
        : `Store API request failed (${response.status})`,
      {
        kind: "http",
        status: response.status,
        detail,
      }
    );
  }
  return (await response.json()) as T;
}

export async function fetchCategoryTree() {
  const payload = await fetchStore<StoreCategoryNode[]>("/api/categories/tree");
  return Array.isArray(payload) ? payload : [];
}
