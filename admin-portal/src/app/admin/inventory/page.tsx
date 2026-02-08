"use client";

import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type InventoryDoc = {
  _id: string;
  sku: string;
  availableQty: number;
  reservedQty: number;
  allowBackorder: boolean;
  display?: {
    colorName?: string;
    sizeLabel?: string;
    materialLabel?: string;
  };
  care?: {
    washCare?: string[];
  };
  returnPolicy?: {
    returnable?: boolean;
    windowDays?: number;
    type?: string;
    notes?: string;
  };
};

function parseCsv(input: string) {
  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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
    const availableQty = window.prompt("Available qty", String(item.availableQty || 0));
    if (availableQty === null) return;
    const reservedQty = window.prompt("Reserved qty", String(item.reservedQty || 0));
    if (reservedQty === null) return;
    const colorName = window.prompt("Color", item.display?.colorName || "");
    if (colorName === null) return;
    const sizeLabel = window.prompt("Size", item.display?.sizeLabel || "");
    if (sizeLabel === null) return;
    const returnable = window.prompt("Returnable? (yes/no)", item.returnPolicy?.returnable ? "yes" : "no");
    if (returnable === null) return;
    const windowDays = window.prompt("Return window days", String(item.returnPolicy?.windowDays || 0));
    if (windowDays === null) return;
    const washCare = window.prompt("Wash care (comma separated)", (item.care?.washCare || []).join(", "));
    if (washCare === null) return;

    await apiRequest(`/api/admin/products/inventory/${item._id}`, {
      service: "product",
      method: "PATCH",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
      body: {
        availableQty: Number(availableQty),
        reservedQty: Number(reservedQty),
        display: {
          colorName,
          sizeLabel,
          materialLabel: item.display?.materialLabel || "",
        },
        care: {
          washCare: parseCsv(washCare),
          ironCare: "",
          bleach: "",
          dryClean: "",
          dryInstructions: "",
        },
        returnPolicy: {
          returnable: /^y(es)?$/i.test(returnable),
          windowDays: Number(windowDays),
          type: /^y(es)?$/i.test(returnable) ? "exchange_or_refund" : "none",
          notes: item.returnPolicy?.notes || "",
        },
      },
    });
    load();
  };

  return (
    <ProtectedPage anyOf={["inventory:read", "inventory:write"]}>
      <section className="card row">
        <h1 style={{ marginRight: "auto" }}>Inventory</h1>
        <button className="secondary" onClick={load}>Refresh</button>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["SKU", "Color", "Size", "Wash Care", "Returnable", "Window", "Available", "Reserved", "Backorder", "Action"]}
        rows={items.map((item) => [
          item.sku,
          item.display?.colorName || "-",
          item.display?.sizeLabel || "-",
          (item.care?.washCare || []).join(", ") || "-",
          item.returnPolicy?.returnable ? "Yes" : "No",
          String(item.returnPolicy?.windowDays || 0),
          String(item.availableQty || 0),
          String(item.reservedQty || 0),
          item.allowBackorder ? "Yes" : "No",
          <button key={item._id} className="secondary" onClick={() => editItem(item)}>Edit</button>,
        ])}
      />
    </ProtectedPage>
  );
}
