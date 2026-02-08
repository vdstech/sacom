"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/products");
    const timer = window.setTimeout(() => {
      router.replace("/login");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [router]);

  return <section className="card">Loading admin workspace...</section>;
}
