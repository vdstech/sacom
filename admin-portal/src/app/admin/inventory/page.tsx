"use client";

import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type InventoryDoc = {
  _id: string;
  stockKey: string;
  variantId?: string;
  sizeLabel?: string;
  quantity: number;
  reorderLevel: number;
};

export default function InventoryPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [items, setItems] = useState<InventoryDoc[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const payload = await apiRequest<InventoryDoc[]>("/api/admin/products/inventory/list", {
        service: "product",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setItems(payload || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, []);

  const editItem = async (item: InventoryDoc) => {
    const quantity = window.prompt("Quantity", String(item.quantity || 0));
    if (quantity === null) return;
    const reorderLevel = window.prompt("Reorder level", String(item.reorderLevel || 0));
    if (reorderLevel === null) return;

    await apiRequest(`/api/admin/products/inventory/${item._id}`, {
      service: "product",
      method: "PATCH",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
      body: {
        quantity: Number(quantity),
        reorderLevel: Number(reorderLevel),
      },
    });
    load();
  };

  return (
    <ProtectedPage anyOf={["inventory:read", "inventory:write"]}>
      <section className="card row">
        <h1 style={{ marginRight: "auto" }}>Stock</h1>
        <button className="secondary" onClick={load}>Refresh</button>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Stock Key", "Variant", "Size", "Quantity", "Reorder Level", "Action"]}
        rows={items.map((item) => [
          item.stockKey,
          item.variantId || "-",
          item.sizeLabel || "-",
          String(item.quantity || 0),
          String(item.reorderLevel || 0),
          <button key={item._id} className="secondary" onClick={() => editItem(item)}>Edit</button>,
        ])}
      />
    </ProtectedPage>
  );
}
