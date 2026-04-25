import { notFound } from "next/navigation";
import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";
import { getOrderDashboardBucketMeta } from "@/lib/orderDashboard";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export default function OrdersDashboardBucketPage({ params }: { params: { bucket: string } }) {
  const meta = getOrderDashboardBucketMeta(params.bucket);
  if (!meta) notFound();

  return (
    <OrdersWorkspace
      title={ADMIN_UI_STRINGS.orders.dashboardTitle}
      subtitle={meta.label}
      lockedFulfillmentStatus={meta.fulfillmentStatus}
      lockedPaymentStatus={meta.paymentStatus}
      backHref="/admin/orders/dashboard"
      backLabel={ADMIN_UI_STRINGS.orders.backToDashboard}
    />
  );
}
