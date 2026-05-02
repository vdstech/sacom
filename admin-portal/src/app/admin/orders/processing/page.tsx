import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export default function ProcessingOrdersPage() {
  return (
    <OrdersWorkspace
      title={ADMIN_UI_STRINGS.menu.processingManager}
      subtitle={ADMIN_UI_STRINGS.orders.summaryReceived}
      backHref="/admin/orders/dashboard"
      backLabel={ADMIN_UI_STRINGS.orders.backToDashboard}
      requiredAnyOf={["order:processing"]}
      lane="processing"
    />
  );
}
