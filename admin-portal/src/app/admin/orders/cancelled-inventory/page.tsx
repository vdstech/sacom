import { redirect } from "next/navigation";

export default function CancelledInventoryOrdersPage() {
  redirect("/admin/orders/cancellations");
}
