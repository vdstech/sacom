import { StoreRequestError } from "@/lib/storeApi";
import { STOREFRONT_STORAGE_KEYS } from "@/lib/constants";

const CUSTOMER_ACCESS_TOKEN_STORAGE_KEY = STOREFRONT_STORAGE_KEYS.customerAccessToken;

export type CustomerProfile = {
  id: string;
  email: string;
  name: string;
  phone?: string;
};

export type CustomerAddress = {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export type CustomerWishlistItem = {
  _id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  categorySlug?: string;
  defaultVariant?: {
    variantId?: string;
    price?: number;
    effectivePrice?: number;
    discount?: { type?: string; value?: number; label?: string };
    imageUrl?: string;
    colors?: Array<{ name?: string; hex?: string }>;
    sizeLabel?: string;
  } | null;
};

export type CustomerOrderItem = {
  productId?: string;
  variantId?: string;
  stockKey?: string;
  slug?: string;
  title: string;
  imageUrl?: string;
  quantity: number;
  currency?: string;
  listUnitPrice?: number;
  catalogDiscountType?: string;
  catalogDiscountValue?: number;
  catalogDiscountLabel?: string;
  catalogDiscountAmount?: number;
  promoDiscountType?: string;
  promoDiscountValue?: number;
  promoDiscountLabel?: string;
  promoDiscountAmount?: number;
  finalUnitPrice?: number;
  lineSubtotal?: number;
  lineTaxTotal?: number;
  lineShippingTotal?: number;
  lineDiscountTotal?: number;
  lineGrandTotal?: number;
  unitPrice: number;
  lineTotal: number;
};

export type CustomerOrderAddressSnapshot = {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type CustomerOrder = {
  id: string;
  placedAt?: string;
  status: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  itemCount: number;
  subtotal?: number;
  discountTotal?: number;
  shippingTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  total: number;
  currency?: string;
  pricingVersion?: number;
  couponCode?: string;
  paymentReference?: string;
  addressSnapshot?: CustomerOrderAddressSnapshot | null;
  items: CustomerOrderItem[];
};

function getBaseUrl() {
  return "/api/proxy";
}

export function readCustomerAccessToken() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(CUSTOMER_ACCESS_TOKEN_STORAGE_KEY) || "").trim();
}

export function persistCustomerAccessToken(token: string) {
  if (typeof window === "undefined") return;
  if (!token) {
    window.localStorage.removeItem(CUSTOMER_ACCESS_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CUSTOMER_ACCESS_TOKEN_STORAGE_KEY, token);
}

export function clearCustomerAccessToken() {
  persistCustomerAccessToken("");
}

async function requestCustomer<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...(init || {}),
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new StoreRequestError(`Customer API request failed before response: ${message}`, {
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
      detail = String(await response.text()).trim();
    }
    throw new StoreRequestError(
      detail ? `Customer API request failed (${response.status}): ${detail}` : `Customer API request failed (${response.status})`,
      { kind: "http", status: response.status, detail }
    );
  }

  return (await response.json()) as T;
}

export async function customerSignup(input: { name: string; email: string; password: string; phone?: string }) {
  return requestCustomer<{ customer: CustomerProfile; accessToken: string }>(
    "/auth/customer/signup",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function customerLogin(input: { email: string; password: string }) {
  return requestCustomer<{ customer: CustomerProfile; accessToken: string }>(
    "/auth/customer/login",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function customerRefresh() {
  return requestCustomer<{ customer: CustomerProfile; accessToken: string }>(
    "/auth/customer/refresh",
    { method: "POST" }
  );
}

export async function customerLogout() {
  return requestCustomer<{ message: string }>(
    "/auth/customer/logout",
    { method: "POST" }
  );
}

export async function fetchCustomerMe(token: string) {
  return requestCustomer<{ customer: CustomerProfile }>("/api/customer/me", undefined, token);
}

export async function fetchCustomerAddresses(token: string) {
  return requestCustomer<{ addresses: CustomerAddress[] }>("/api/customer/addresses", undefined, token);
}

export async function createCustomerAddress(token: string, payload: Omit<CustomerAddress, "id">) {
  return requestCustomer<{ address: CustomerAddress }>(
    "/api/customer/addresses",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function updateCustomerAddress(token: string, id: string, payload: Partial<Omit<CustomerAddress, "id">>) {
  return requestCustomer<{ address: CustomerAddress }>(
    `/api/customer/addresses/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
}

export async function deleteCustomerAddress(token: string, id: string) {
  return requestCustomer<{ success: boolean }>(
    `/api/customer/addresses/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token
  );
}

export async function fetchCustomerWishlist(token: string) {
  return requestCustomer<{ items: CustomerWishlistItem[] }>("/api/customer/wishlist", undefined, token);
}

export async function addCustomerWishlistItem(token: string, productId: string) {
  return requestCustomer<{ items: CustomerWishlistItem[] }>(
    "/api/customer/wishlist",
    { method: "POST", body: JSON.stringify({ productId }) },
    token
  );
}

export async function removeCustomerWishlistItem(token: string, productId: string) {
  return requestCustomer<{ success: boolean }>(
    `/api/customer/wishlist/${encodeURIComponent(productId)}`,
    { method: "DELETE" },
    token
  );
}

export async function fetchCustomerOrders(token: string) {
  return requestCustomer<{ orders: CustomerOrder[] }>("/api/customer/orders", undefined, token);
}

export async function fetchCustomerOrder(token: string, id: string) {
  return requestCustomer<{ order: CustomerOrder }>(
    `/api/customer/orders/${encodeURIComponent(id)}`,
    undefined,
    token
  );
}
