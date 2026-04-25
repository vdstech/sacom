import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export default function OrdersPage() {
  return (
    <OrdersWorkspace
      title={ADMIN_UI_STRINGS.orders.title}
      subtitle={ADMIN_UI_STRINGS.orders.detailTitle}
      backHref="/admin/orders/dashboard"
      backLabel={ADMIN_UI_STRINGS.menu.ordersDashboard}
    />
  );
}
