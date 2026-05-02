export type OrderOperationsTab = "processing" | "shipping" | "shipped";
export type FutureOrderOperationsTab = OrderOperationsTab | "delivered";
export type OrderOperationsSort = "newest" | "oldest" | "price_desc" | "price_asc";

export type OrderOperationsSummary = {
  processing: number;
  shipping: number;
  shipped: number;
  delivered: number;
};

export type OrderOperationsAddress = {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type OrderOperationsItem = {
  orderId: string;
  orderItemId: string;
  productId: string;
  slug: string;
  productName: string;
  sku: string;
  stockKey: string;
  productPrice: number;
  quantity: number;
  status: string;
  customerName: string;
  customerContact: string;
  shippingAddress: OrderOperationsAddress | null;
  physicalOwner: string;
  courierName: string;
  trackingNumber: string;
  createdAt: string | null;
  lastUpdatedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  deliveredBy: string;
};

export type OrderOperationsResponse = {
  summary: OrderOperationsSummary;
  items: OrderOperationsItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export const ORDER_OPERATIONS_TABS: Array<{ key: OrderOperationsTab; label: string }> = [
  { key: "processing", label: "Processing" },
  { key: "shipping", label: "Shipping" },
  { key: "shipped", label: "Shipped" },
];

export const ORDER_OPERATION_SORT_OPTIONS: Array<{ value: OrderOperationsSort; label: string }> = [
  { value: "newest", label: "Newest order first" },
  { value: "oldest", label: "Oldest order first" },
  { value: "price_desc", label: "Price high to low" },
  { value: "price_asc", label: "Price low to high" },
];

export function isSystemAdmin(systemLevel?: string | null) {
  const level = String(systemLevel || "NONE").toUpperCase();
  return level === "ADMIN" || level === "SUPER";
}

export function canMarkDelivered(item: Pick<OrderOperationsItem, "status">, tab: OrderOperationsTab) {
  return tab === "shipped" && String(item.status || "").toUpperCase() === "SHIPPED";
}

export function getOrderOperationStatusOptions(tab: OrderOperationsTab) {
  if (tab === "processing") {
    return ["RESERVED", "PICKED_FROM_WAREHOUSE", "CANCEL_REQUESTED"];
  }
  if (tab === "shipping") {
    return ["HANDED_TO_SHIPPING", "SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS", "CANCEL_REQUESTED"];
  }
  return [];
}

export function formatOrderOperationAddress(address?: OrderOperationsAddress | null) {
  if (!address) return [];
  return [
    address.fullName,
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
  ].filter(Boolean) as string[];
}
