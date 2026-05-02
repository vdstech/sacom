import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export default function ShippingOrdersPage() {
  return (
    <OrdersWorkspace
      title={ADMIN_UI_STRINGS.menu.shippingOperator}
      subtitle={ADMIN_UI_STRINGS.orders.summaryShippingQueue}
      backHref="/admin/orders/dashboard"
      backLabel={ADMIN_UI_STRINGS.orders.backToDashboard}
      requiredAnyOf={["order:shipping"]}
      lane="shipping"
    />
  );
}
