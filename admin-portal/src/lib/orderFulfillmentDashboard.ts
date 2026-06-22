"use client";

export type OrdersDashboardTab = "overview" | "fulfillment" | "escalations";
export type FulfillmentDashboardBucket = "" | "processing" | "packaging" | "shipping" | "shipped" | "delayed";

export type FulfillmentDashboardSummary = {
  processing: number;
  packaging: number;
  shipping: number;
  shipped: number;
  delayed: number;
  violated: number;
  total: number;
};

export type FulfillmentDashboardItem = {
  orderId: string;
  orderDisplayId: string;
  itemId: string;
  customerName: string;
  currentFulfillmentStatus: string;
  currentStage: string;
  currentOwner: string;
  customerOrderedDate: string | null;
  targetCompletionDate: string | null;
  laneAssignedAt: string | null;
  lastActionedAt: string | null;
  slaStatus: string;
  hoursInLane: number;
  activeEscalation?: {
    id?: string;
    lane?: string;
    responsibleOwner?: string;
    triggeredAt?: string | null;
    hoursPending?: number;
    reason?: string;
    status?: string;
    resolvedAt?: string | null;
  } | null;
  courierName?: string;
  outboundTrackingNumber?: string;
};

export type FulfillmentDashboardResponse = {
  summary: FulfillmentDashboardSummary;
  items: FulfillmentDashboardItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export const FULFILLMENT_DASHBOARD_BUCKETS: Array<{ key: FulfillmentDashboardBucket; label: string }> = [
  { key: "", label: "All Active Stages" },
  { key: "processing", label: "Processing" },
  { key: "packaging", label: "Packaging" },
  { key: "shipping", label: "Shipping" },
  { key: "shipped", label: "Shipped" },
  { key: "delayed", label: "Delayed" },
];

export function normalizeOrdersDashboardTab(value: string | null | undefined, availableTabs: OrdersDashboardTab[]) {
  const normalized = String(value || "").trim().toLowerCase() as OrdersDashboardTab;
  return availableTabs.includes(normalized) ? normalized : availableTabs[0] || "overview";
}
