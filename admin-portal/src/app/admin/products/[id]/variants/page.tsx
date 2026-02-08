"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type VariantDoc = {
  _id: string;
  sku: string;
  price: number;
  isActive: boolean;
  merchandise?: {
    color?: {
      name?: string;
      family?: string;
      hex?: string;
    };
    size?: {
      label?: string;
      system?: string;
    };
  };
  inventory?: {
    _id: string;
    availableQty: number;
  } | null;
};

function parseCsv(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ProductVariantsPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, refreshAccessToken } = useAuth();
  const [variants, setVariants] = useState<VariantDoc[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const payload = await apiRequest<VariantDoc[]>(`/api/admin/products/${id}/variants`, {
        service: "product",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setVariants(payload || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, [id]);

  const createVariant = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await apiRequest(`/api/admin/products/${id}/variants`, {
      service: "product",
      method: "POST",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
      body: {
        sku: String(form.get("sku") || ""),
        price: Number(form.get("price") || 0),
        isActive: true,
        merchandise: {
          color: {
            name: String(form.get("colorName") || ""),
            family: String(form.get("colorFamily") || ""),
            hex: String(form.get("colorHex") || ""),
          },
          size: {
            label: String(form.get("sizeLabel") || ""),
            system: String(form.get("sizeSystem") || ""),
            sortKey: Number(form.get("sizeSortKey") || 0),
          },
          blouse: {
            included: form.get("blouseIncluded") === "on",
            type: String(form.get("blouseType") || ""),
            lengthMeters: Number(form.get("blouseLengthMeters") || 0),
          },
          saree: {
            lengthMeters: Number(form.get("sareeLengthMeters") || 0),
            widthMeters: Number(form.get("sareeWidthMeters") || 0),
            weightGrams: Number(form.get("sareeWeightGrams") || 0),
            fallPicoDone: form.get("fallPicoDone") === "on",
            stitchReady: form.get("stitchReady") === "on",
          },
          style: {
            occasionTags: parseCsv(form.get("occasionTags")),
            workType: String(form.get("workType") || ""),
            pattern: String(form.get("pattern") || ""),
          },
        },
        inventory: {
          availableQty: Number(form.get("availableQty") || 0),
          trackInventory: true,
          reservedQty: 0,
          allowBackorder: false,
          reorderLevel: 0,
          display: {
            colorName: String(form.get("colorName") || ""),
            sizeLabel: String(form.get("sizeLabel") || ""),
            materialLabel: "",
          },
          care: {
            washCare: [],
            ironCare: "",
            bleach: "",
            dryClean: "",
            dryInstructions: "",
          },
          returnPolicy: {
            returnable: false,
            windowDays: 0,
            type: "none",
            notes: "",
          },
        },
      },
    });
    (e.currentTarget as HTMLFormElement).reset();
    load();
  };

  return (
    <ProtectedPage anyOf={["product:read", "product:write"]}>
      <section className="card">
        <h1>Variants</h1>
        <form onSubmit={createVariant} className="row" style={{ flexWrap: "wrap", alignItems: "end", gap: 12 }}>
          <label>SKU<input name="sku" required /></label>
          <label>Price<input type="number" name="price" required /></label>
          <label>Color Name<input name="colorName" required /></label>
          <label>Color Family<input name="colorFamily" /></label>
          <label>Color Hex<input name="colorHex" placeholder="#AABBCC" /></label>
          <label>Size Label<input name="sizeLabel" /></label>
          <label>Size System<input name="sizeSystem" placeholder="Free/IN/UK" /></label>
          <label>Size Sort Key<input type="number" name="sizeSortKey" defaultValue={0} /></label>
          <label>Initial Qty<input type="number" name="availableQty" defaultValue={0} /></label>
          <label>Saree Length (m)<input type="number" step="0.1" min="0" name="sareeLengthMeters" defaultValue={0} /></label>
          <label>Saree Width (m)<input type="number" step="0.1" min="0" name="sareeWidthMeters" defaultValue={0} /></label>
          <label>Weight (g)<input type="number" min="0" name="sareeWeightGrams" defaultValue={0} /></label>
          <label><input type="checkbox" name="blouseIncluded" /> Blouse Included</label>
          <label>Blouse Type<input name="blouseType" /></label>
          <label>Blouse Length (m)<input type="number" step="0.1" min="0" name="blouseLengthMeters" defaultValue={0} /></label>
          <label><input type="checkbox" name="fallPicoDone" /> Fall Pico Done</label>
          <label><input type="checkbox" name="stitchReady" /> Stitch Ready</label>
          <label>Occasions (csv)<input name="occasionTags" /></label>
          <label>Work Type<input name="workType" /></label>
          <label>Pattern<input name="pattern" /></label>
          <button>Create Variant</button>
        </form>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Swatch", "Color", "Size", "SKU", "Price", "Active", "Available Qty"]}
        rows={variants.map((v) => {
          const color = v.merchandise?.color?.name || "-";
          const hex = v.merchandise?.color?.hex || "";
          return [
            <span
              key={`swatch-${v._id}`}
              title={hex || color}
              style={{
                display: "inline-block",
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "1px solid #ccc",
                background: hex || "#f2f2f2",
              }}
            />,
            color,
            v.merchandise?.size?.label || "-",
            v.sku,
            String(v.price),
            v.isActive ? "Yes" : "No",
            String(v.inventory?.availableQty ?? "-"),
          ];
        })}
      />
    </ProtectedPage>
  );
}
