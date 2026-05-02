import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export default function PackagingOrdersPage() {
  return (
    <OrdersWorkspace
      title={ADMIN_UI_STRINGS.menu.packagingManager}
      subtitle={ADMIN_UI_STRINGS.orders.summaryPacked}
      backHref="/admin/orders/dashboard"
      backLabel={ADMIN_UI_STRINGS.orders.backToDashboard}
      requiredAnyOf={["order:packaging"]}
      lane="packaging"
    />
  );
}
