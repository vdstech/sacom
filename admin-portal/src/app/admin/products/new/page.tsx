"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type CategoryDoc = { _id: string; name: string };

function parseCsv(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function NewProductPage() {
  const router = useRouter();
  const { accessToken, refreshAccessToken } = useAuth();
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<CategoryDoc[]>("/api/categories", {
      service: "catalog",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    }).then(setCategories).catch((e) => setError((e as Error).message));
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const primaryCategoryId = String(form.get("primaryCategoryId") || "");

    try {
      await apiRequest("/api/admin/products", {
        service: "product",
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          title: String(form.get("title") || ""),
          slug: String(form.get("slug") || ""),
          description: String(form.get("description") || ""),
          shortDescription: String(form.get("shortDescription") || ""),
          primaryCategoryId,
          categoryIds: [primaryCategoryId],
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
          isActive: form.get("isActive") === "on",
          isFeatured: form.get("isFeatured") === "on",
        },
      });
      router.push("/admin/products");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["product:write"]}>
      <section className="card">
        <h1>Create Product</h1>
        <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>Title<input name="title" required /></label>
          <label>Slug<input name="slug" required /></label>
          <label>Description<textarea name="description" /></label>
          <label>Short Description<input name="shortDescription" /></label>
          <label>Currency<input name="currency" defaultValue="INR" /></label>
          <label>Tags (comma separated)<input name="tags" /></label>
          <label>Occasions (comma separated)<input name="occasionTags" /></label>

          <label>Primary Category
            <select name="primaryCategoryId" required>
              <option value="">Select category</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </label>

          <h3>Material Profile</h3>
          <label>Fabric<input name="fabric" /></label>
          <label>Weave<input name="weave" /></label>
          <label>Work Type<input name="workType" /></label>
          <label>Pattern<input name="pattern" /></label>
          <label>Border Style<input name="borderStyle" /></label>
          <label>Pallu Style<input name="palluStyle" /></label>

          <h3>Blouse Default</h3>
          <label><input type="checkbox" name="blouseIncluded" /> Included</label>
          <label>Type<input name="blouseType" /></label>
          <label>Length (meters)<input type="number" step="0.1" min="0" name="blouseLengthMeters" defaultValue="0" /></label>

          <h3>Care Default</h3>
          <label>Wash Care (comma separated)<input name="washCare" /></label>
          <label>Iron Care<input name="ironCare" /></label>
          <label>Bleach<input name="bleach" /></label>
          <label>Dry Clean<input name="dryClean" /></label>
          <label>Dry Instructions<input name="dryInstructions" /></label>

          <h3>Return Policy Default</h3>
          <label><input type="checkbox" name="returnable" /> Returnable</label>
          <label>Window Days<input type="number" min="0" name="windowDays" defaultValue="0" /></label>
          <label>Type
            <select name="returnType" defaultValue="none">
              <option value="none">none</option>
              <option value="exchange">exchange</option>
              <option value="refund">refund</option>
              <option value="exchange_or_refund">exchange_or_refund</option>
            </select>
          </label>
          <label>Notes<textarea name="returnNotes" /></label>

          <label><input type="checkbox" name="isActive" defaultChecked /> Active</label>
          <label><input type="checkbox" name="isFeatured" /> Featured</label>
          {error ? <div className="error">{error}</div> : null}
          <button>Create Product</button>
        </form>
      </section>
    </ProtectedPage>
  );
}
