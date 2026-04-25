import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export type OrderDashboardBucket =
  | "received"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "cancelled-by-admin"
  | "payment-failed"
  | "total";

export function getOrderDashboardBucketMeta(bucket: string) {
  const key = String(bucket || "").trim().toLowerCase() as OrderDashboardBucket;

  if (key === "received") {
    return {
      bucket: key,
      label: ADMIN_UI_STRINGS.orders.summaryReceived,
      href: "/admin/orders/dashboard/received",
      fulfillmentStatus: "processing",
      paymentStatus: "",
    };
  }
  if (key === "packed") {
    return {
      bucket: key,
      label: ADMIN_UI_STRINGS.orders.summaryPacked,
      href: "/admin/orders/dashboard/packed",
      fulfillmentStatus: "packed",
      paymentStatus: "",
    };
  }
  if (key === "shipped") {
    return {
      bucket: key,
      label: ADMIN_UI_STRINGS.orders.summaryShipped,
      href: "/admin/orders/dashboard/shipped",
      fulfillmentStatus: "shipped",
      paymentStatus: "",
    };
  }
  if (key === "delivered") {
    return {
      bucket: key,
      label: ADMIN_UI_STRINGS.orders.summaryDelivered,
      href: "/admin/orders/dashboard/delivered",
      fulfillmentStatus: "delivered",
      paymentStatus: "",
    };
  }
  if (key === "cancelled") {
    return {
      bucket: key,
      label: ADMIN_UI_STRINGS.orders.summaryCancelled,
      href: "/admin/orders/dashboard/cancelled",
      fulfillmentStatus: "cancelled",
      paymentStatus: "",
    };
  }
  if (key === "cancelled-by-admin") {
    return {
      bucket: key,
      label: ADMIN_UI_STRINGS.orders.summaryCancelledByAdmin,
      href: "/admin/orders/dashboard/cancelled-by-admin",
      fulfillmentStatus: "cancelled_by_admin",
      paymentStatus: "",
    };
  }
  if (key === "payment-failed") {
    return {
      bucket: key,
      label: ADMIN_UI_STRINGS.orders.summaryPaymentFailed,
      href: "/admin/orders/dashboard/payment-failed",
      fulfillmentStatus: "",
      paymentStatus: "payment_failed",
    };
  }
  if (key === "total") {
    return {
      bucket: key,
      label: ADMIN_UI_STRINGS.orders.summaryTotal,
      href: "/admin/orders/dashboard/total",
      fulfillmentStatus: "",
      paymentStatus: "",
    };
  }

  return null;
}
