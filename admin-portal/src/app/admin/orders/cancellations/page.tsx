import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export default function CancellationOrdersPage() {
  return (
    <OrdersWorkspace
      title={ADMIN_UI_STRINGS.menu.cancellationManager}
      subtitle={ADMIN_UI_STRINGS.orders.summaryCancellationReceiptPending}
      backHref="/admin/orders/dashboard"
      backLabel={ADMIN_UI_STRINGS.orders.backToDashboard}
      requiredAnyOf={["order:cancellation"]}
      lane="cancellations"
    />
  );
}
