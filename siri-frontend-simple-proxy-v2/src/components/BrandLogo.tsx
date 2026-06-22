"use client";

import { STOREFRONT_STRINGS } from "@/lib/strings";

export function BrandLogo() {
  return (
    <span className="brand-mark">
      <span className="brand-mark__word" lang="te">
        {STOREFRONT_STRINGS.brand.name}
      </span>
    </span>
  );
}
