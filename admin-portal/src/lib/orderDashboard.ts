import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export type OrderDashboardBucket = "processing" | "packaging" | "shipping" | "cancellations";

type OrderDashboardBucketMeta = {
  bucket: OrderDashboardBucket;
  label: string;
  href: string;
};

const ORDER_DASHBOARD_BUCKETS: Record<OrderDashboardBucket, OrderDashboardBucketMeta> = {
  processing: {
    bucket: "processing",
    label: ADMIN_UI_STRINGS.orders.summaryReceived,
    href: "/admin/orders/processing",
  },
  packaging: {
    bucket: "packaging",
    label: ADMIN_UI_STRINGS.orders.summaryPacked,
    href: "/admin/orders/packaging",
  },
  shipping: {
    bucket: "shipping",
    label: ADMIN_UI_STRINGS.orders.summaryShippingQueue,
    href: "/admin/orders/shipping",
  },
  cancellations: {
    bucket: "cancellations",
    label: ADMIN_UI_STRINGS.orders.summaryCancellationReceiptPending,
    href: "/admin/orders/cancellations",
  },
};

export function getOrderDashboardBucketMeta(bucket: string) {
  const key = String(bucket || "").trim().toLowerCase() as OrderDashboardBucket;
  return ORDER_DASHBOARD_BUCKETS[key] || null;
}

export function getOrderDashboardBuckets() {
  return Object.values(ORDER_DASHBOARD_BUCKETS);
}
