import { notFound, redirect } from "next/navigation";
import { getOrderDashboardBucketMeta } from "@/lib/orderDashboard";

export default function OrdersDashboardBucketPage({ params }: { params: { bucket: string } }) {
  const meta = getOrderDashboardBucketMeta(params.bucket);
  if (!meta) notFound();
  redirect(meta.href);
}
