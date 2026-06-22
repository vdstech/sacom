import { StoreRequestError, type ProductReview } from "@/lib/storeApi";
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
    stockKey?: string;
    canMoveToCart?: boolean;
    requiresSelection?: boolean;
  } | null;
};

export type CustomerOrderItem = {
  id: string;
  productId?: string;
  variantId?: string;
  categoryId?: string;
  categoryLabel?: string;
  stockKey?: string;
  slug?: string;
  title: string;
  imageUrl?: string;
  quantity: number;
  fulfillmentStatus?: string;
  outboundTrackingNumber?: string;
  collectionTrackingNumber?: string;
  cancelRequestedAt?: string | null;
  unpackedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  adminCancelledAt?: string | null;
  returnRequestedAt?: string | null;
  collectionScheduledAt?: string | null;
  returnReceivedAt?: string | null;
  refundCompletedAt?: string | null;
  returnEligible?: boolean;
  returnEligibilityReason?: string;
  returnWindowEndsAt?: string | null;
  canRequestReturn?: boolean;
  canRequestExchange?: boolean;
  returnExchangeBlockReason?: string;
  returnExchangeCase?: {
    caseId: string;
    kind: "RETURN" | "EXCHANGE";
    status: string;
    reason: string;
    phoneNumber?: string;
    whatsappNumber?: string;
    courierName?: string;
    returnTrackingNumber?: string;
    createdAt?: string | null;
    investigationStartedAt?: string | null;
    acceptedAt?: string | null;
    rejectedAt?: string | null;
    trackingUpdatedAt?: string | null;
    receivedAt?: string | null;
    placeholderCreatedAt?: string | null;
    couponGeneratedAt?: string | null;
  } | null;
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
  taxRate?: number;
  priceIncludesTax?: boolean;
  finalUnitPrice?: number;
  lineSubtotal?: number;
  lineTaxableBaseTotal?: number;
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
  displayId?: string;
  displayReference?: string;
  placedAt?: string;
  status: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  itemCount: number;
  subtotal?: number;
  discountTotal?: number;
  shippingTotal?: number;
  taxableBaseTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  total: number;
  currency?: string;
  pricingVersion?: number;
  pricingSnapshot?: {
    version?: number;
    currency?: string;
    pricingRuleVersion?: number;
    priceIncludesTax?: boolean;
    taxMode?: string;
    subtotalBeforeCoupon?: number;
    catalogDiscountTotal?: number;
    couponDiscountTotal?: number;
    discountTotal?: number;
    discountedMerchandiseTotalBeforeCoupon?: number;
    discountedMerchandiseTotal?: number;
    taxableBaseTotal?: number;
    shippingTotal?: number;
    taxTotal?: number;
    includedTaxTotal?: number;
    shippingTaxTotal?: number;
    grandTotal?: number;
    payableTotal?: number;
    allocationMode?: string;
    taxRatesUsed?: number[];
    shippingRule?: {
      key?: string;
      label?: string;
      amount?: number;
      standardCharge?: number;
      freeThreshold?: number;
      eligibleSubtotal?: number;
      shippingTaxMode?: string;
      shippingTaxTotal?: number;
    };
    taxRule?: {
      key?: string;
      label?: string;
      defaultRate?: number;
      ratePercent?: number;
      amount?: number;
      taxMode?: string;
    };
  } | null;
  couponCode?: string;
  couponDiscountTotal?: number;
  couponAppliedAmount?: number;
  couponForfeitedAmount?: number;
  paymentReference?: string;
  addressSnapshot?: CustomerOrderAddressSnapshot | null;
  items: CustomerOrderItem[];
};

export type CustomerCoupon = {
  id: string;
  code: string;
  valueAmount: number;
  currency?: string;
  status: string;
  validFrom?: string | null;
  validUntil?: string | null;
  usedAt?: string | null;
};

export type CustomerCheckoutSession = {
  id: string;
  cartToken: string;
  status: string;
  paymentStatus?: string;
  currency?: string;
  subtotal: number;
  discountTotal?: number;
  taxableBaseTotal?: number;
  includedTaxTotal?: number;
  shippingTotal?: number;
  taxTotal?: number;
  couponAppliedAmount: number;
  payableAmount: number;
  forfeitureAmount: number;
  lastAttemptedAt?: string | null;
  failedAt?: string | null;
  failureCode?: string;
  failureReason?: string;
  pricingSnapshot?: CustomerOrder["pricingSnapshot"];
  expiresAt?: string | null;
  coupon?: CustomerCoupon | null;
};

export type CustomerProductReview = ProductReview;

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

function createIdempotencyKey(prefix: string) {
  const suffix = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
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

export async function fetchCustomerCoupons(token: string) {
  return requestCustomer<{ coupons: CustomerCoupon[] }>("/api/customer/orders/coupons", undefined, token);
}

export async function createCheckoutSession(token: string, payload: { cartToken: string }) {
  return requestCustomer<{ session: CustomerCheckoutSession }>(
    "/api/customer/orders/checkout/session",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function fetchCheckoutSession(token: string, sessionId: string) {
  return requestCustomer<{ session: CustomerCheckoutSession }>(
    `/api/customer/orders/checkout/session/${encodeURIComponent(sessionId)}`,
    undefined,
    token
  );
}

export async function applyCheckoutCoupon(token: string, sessionId: string, couponCode: string) {
  return requestCustomer<{ session: CustomerCheckoutSession }>(
    `/api/customer/orders/checkout/session/${encodeURIComponent(sessionId)}/coupon/apply`,
    {
      method: "POST",
      headers: { "Idempotency-Key": createIdempotencyKey("coupon-apply") },
      body: JSON.stringify({ couponCode }),
    },
    token
  );
}

export async function removeCheckoutCoupon(token: string, sessionId: string) {
  return requestCustomer<{ session: CustomerCheckoutSession }>(
    `/api/customer/orders/checkout/session/${encodeURIComponent(sessionId)}/coupon`,
    { method: "DELETE" },
    token
  );
}

export async function abandonCheckoutSession(token: string, sessionId: string) {
  return requestCustomer<{ session: { id: string; status: string } }>(
    `/api/customer/orders/checkout/session/${encodeURIComponent(sessionId)}/abandon`,
    { method: "POST" },
    token
  );
}

export async function confirmCheckoutSession(
  token: string,
  sessionId: string,
  payload: { addressId: string; paymentStatus?: "paid" | "payment_failed" }
) {
  return requestCustomer<{ order: CustomerOrder; session: { id: string; status: string } }>(
    `/api/customer/orders/checkout/session/${encodeURIComponent(sessionId)}/confirm`,
    {
      method: "POST",
      headers: { "Idempotency-Key": createIdempotencyKey("checkout-confirm") },
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function fetchCustomerOrder(token: string, id: string) {
  return requestCustomer<{ order: CustomerOrder }>(
    `/api/customer/orders/${encodeURIComponent(id)}`,
    undefined,
    token
  );
}

export async function cancelCustomerOrder(token: string, id: string) {
  return requestCustomer<{ order: CustomerOrder }>(
    `/api/customer/orders/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
    token
  );
}

export async function cancelCustomerOrderItem(token: string, orderId: string, itemId: string) {
  return requestCustomer<{ order: CustomerOrder }>(
    `/api/customer/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/cancel`,
    { method: "POST" },
    token
  );
}

export async function requestCustomerOrderItemReturn(
  token: string,
  orderId: string,
  itemId: string,
  payload: { reason: string; phoneNumber?: string; whatsappNumber?: string }
) {
  return requestCustomer<{ order: CustomerOrder }>(
    `/api/customer/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/return`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function requestCustomerOrderItemExchange(
  token: string,
  orderId: string,
  itemId: string,
  payload: { reason: string; phoneNumber?: string; whatsappNumber?: string }
) {
  return requestCustomer<{ order: CustomerOrder }>(
    `/api/customer/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/exchange`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function fetchMyProductReview(token: string, productId: string) {
  return requestCustomer<{ review: CustomerProductReview | null }>(
    `/products/${encodeURIComponent(productId)}/reviews/me`,
    undefined,
    token
  );
}

export async function createProductReview(
  token: string,
  productId: string,
  payload: { rating: number; title: string; comment: string; variantId?: string }
) {
  return requestCustomer<{ review: CustomerProductReview }>(
    `/products/${encodeURIComponent(productId)}/reviews`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}
