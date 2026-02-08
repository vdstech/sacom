"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type ProductDoc = {
  _id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  isActive: boolean;
  isFeatured: boolean;
  tags?: string[];
  occasionTags?: string[];
  currency?: string;
  materialProfile?: {
    fabric?: string;
    weave?: string;
    workType?: string;
    pattern?: string;
    borderStyle?: string;
    palluStyle?: string;
  };
  blouseDefault?: {
    included?: boolean;
    type?: string;
    lengthMeters?: number;
  };
  careDefault?: {
    washCare?: string[];
    ironCare?: string;
    bleach?: string;
    dryClean?: string;
    dryInstructions?: string;
  };
  returnPolicyDefault?: {
    returnable?: boolean;
    windowDays?: number;
    type?: string;
    notes?: string;
  };
};

function parseCsv(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, refreshAccessToken } = useAuth();
  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const payload = await apiRequest<ProductDoc>(`/api/admin/products/${id}`, {
        service: "product",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setProduct(payload);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, [id]);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await apiRequest(`/api/admin/products/${id}`, {
      service: "product",
      method: "PUT",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
      body: {
        title: String(form.get("title") || ""),
        slug: String(form.get("slug") || ""),
        description: String(form.get("description") || ""),
        shortDescription: String(form.get("shortDescription") || ""),
        currency: String(form.get("currency") || "INR"),
        tags: parseCsv(form.get("tags")),
        occasionTags: parseCsv(form.get("occasionTags")),
        materialProfile: {
          fabric: String(form.get("fabric") || ""),
          weave: String(form.get("weave") || ""),
          workType: String(form.get("workType") || ""),
          pattern: String(form.get("pattern") || ""),
          borderStyle: String(form.get("borderStyle") || ""),
          palluStyle: String(form.get("palluStyle") || ""),
        },
        blouseDefault: {
          included: form.get("blouseIncluded") === "on",
          type: String(form.get("blouseType") || ""),
          lengthMeters: Number(form.get("blouseLengthMeters") || 0),
        },
        careDefault: {
          washCare: parseCsv(form.get("washCare")),
          ironCare: String(form.get("ironCare") || ""),
          bleach: String(form.get("bleach") || ""),
          dryClean: String(form.get("dryClean") || ""),
          dryInstructions: String(form.get("dryInstructions") || ""),
        },
        returnPolicyDefault: {
          returnable: form.get("returnable") === "on",
          windowDays: Number(form.get("windowDays") || 0),
          type: String(form.get("returnType") || "none"),
          notes: String(form.get("returnNotes") || ""),
        },
        isFeatured: form.get("isFeatured") === "on",
      },
    });
    load();
  };

  return (
    <ProtectedPage anyOf={["product:read", "product:write", "product:delete"]}>
      <section className="card">
        <h1>Product Detail</h1>
        {error ? <div className="error">{error}</div> : null}
        {!product ? <div>Loading...</div> : (
          <form onSubmit={save} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label>Title<input name="title" defaultValue={product.title} required /></label>
            <label>Slug<input name="slug" defaultValue={product.slug} required /></label>
            <label>Description<textarea name="description" defaultValue={product.description || ""} /></label>
            <label>Short Description<input name="shortDescription" defaultValue={product.shortDescription || ""} /></label>
            <label>Currency<input name="currency" defaultValue={product.currency || "INR"} /></label>
            <label>Tags (comma separated)<input name="tags" defaultValue={(product.tags || []).join(", ")} /></label>
            <label>Occasions (comma separated)<input name="occasionTags" defaultValue={(product.occasionTags || []).join(", ")} /></label>

            <h3>Material Profile</h3>
            <label>Fabric<input name="fabric" defaultValue={product.materialProfile?.fabric || ""} /></label>
            <label>Weave<input name="weave" defaultValue={product.materialProfile?.weave || ""} /></label>
            <label>Work Type<input name="workType" defaultValue={product.materialProfile?.workType || ""} /></label>
            <label>Pattern<input name="pattern" defaultValue={product.materialProfile?.pattern || ""} /></label>
            <label>Border Style<input name="borderStyle" defaultValue={product.materialProfile?.borderStyle || ""} /></label>
            <label>Pallu Style<input name="palluStyle" defaultValue={product.materialProfile?.palluStyle || ""} /></label>

            <h3>Blouse Default</h3>
            <label><input type="checkbox" name="blouseIncluded" defaultChecked={!!product.blouseDefault?.included} /> Included</label>
            <label>Type<input name="blouseType" defaultValue={product.blouseDefault?.type || ""} /></label>
            <label>Length (meters)<input type="number" step="0.1" min="0" name="blouseLengthMeters" defaultValue={product.blouseDefault?.lengthMeters || 0} /></label>

            <h3>Care Default</h3>
            <label>Wash Care (comma separated)<input name="washCare" defaultValue={(product.careDefault?.washCare || []).join(", ")} /></label>
            <label>Iron Care<input name="ironCare" defaultValue={product.careDefault?.ironCare || ""} /></label>
            <label>Bleach<input name="bleach" defaultValue={product.careDefault?.bleach || ""} /></label>
            <label>Dry Clean<input name="dryClean" defaultValue={product.careDefault?.dryClean || ""} /></label>
            <label>Dry Instructions<input name="dryInstructions" defaultValue={product.careDefault?.dryInstructions || ""} /></label>

            <h3>Return Policy Default</h3>
            <label><input type="checkbox" name="returnable" defaultChecked={!!product.returnPolicyDefault?.returnable} /> Returnable</label>
            <label>Window Days<input type="number" min="0" name="windowDays" defaultValue={product.returnPolicyDefault?.windowDays || 0} /></label>
            <label>Type
              <select name="returnType" defaultValue={product.returnPolicyDefault?.type || "none"}>
                <option value="none">none</option>
                <option value="exchange">exchange</option>
                <option value="refund">refund</option>
                <option value="exchange_or_refund">exchange_or_refund</option>
              </select>
            </label>
            <label>Notes<textarea name="returnNotes" defaultValue={product.returnPolicyDefault?.notes || ""} /></label>

            <label><input type="checkbox" name="isFeatured" defaultChecked={!!product.isFeatured} /> Featured</label>
            <div className="row">
              <button>Save</button>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  await apiRequest(`/api/admin/products/${id}`, {
                    service: "product",
                    method: "DELETE",
                    token: accessToken,
                    onUnauthorized: refreshAccessToken,
                  });
                  router.push("/admin/products");
                }}
              >
                Delete
              </button>
            </div>
          </form>
        )}
      </section>
    </ProtectedPage>
  );
}
