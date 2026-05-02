import { redirect } from "next/navigation";

export default function OrdersPage() {
  redirect("/admin/orders/dashboard");
}
