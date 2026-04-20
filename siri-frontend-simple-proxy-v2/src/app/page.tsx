"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { fetchCategoryTree, fetchStore, type ProductListItem } from "@/lib/storeApi";
import {
  PRIMARY_MERCH_CATEGORY_SLUG,
  findPrimaryMerchCategoryNode,
  flattenCategories,
  isLiveCategorySlug,
  toTechnicalBannerMessage,
} from "@/lib/storefront";

type CategorySpotlight = {
  label: string;
  href: string;
  categorySlug?: string;
  isLive: boolean;
};

function getLiveInventoryTitle(categories: CategorySpotlight[], liveHref = "") {
  const liveCategory = categories.find((item) => item.href === liveHref);
  return liveCategory?.label || "Selected Collection";
}

export default function Page() {
  const [liveProducts, setLiveProducts] = useState<ProductListItem[]>([]);
  const [featured, setFeatured] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategorySpotlight[]>([]);
  const [liveRailUnavailable, setLiveRailUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [technicalError, setTechnicalError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setTechnicalError("");
        setLiveRailUnavailable(false);

        const tree = await fetchCategoryTree();
        if (cancelled) return;

        const flattened = flattenCategories(tree, [])
          .filter((node) => !!node.slug && !!node.path);
        const nextCategories = flattened.map((node) => ({
          label: node.name,
          href: `/c/${String(node.path || node.slug || "").replace(/^\/+|\/+$/g, "")}`,
          categorySlug: node.slug,
          isLive: isLiveCategorySlug(node.slug),
        }));

        const liveNode = findPrimaryMerchCategoryNode(flattened);
        const liveSlug = PRIMARY_MERCH_CATEGORY_SLUG;

        setCategories(nextCategories);

        if (!liveNode || !liveSlug) {
          setLiveProducts([]);
          setFeatured([]);
          setLiveRailUnavailable(false);
          return;
        }

        const [productResult, featuredResult] = await Promise.allSettled([
          fetchStore<ProductListItem[]>(`/products?categorySlug=${encodeURIComponent(liveSlug)}&limit=8`),
          fetchStore<ProductListItem[]>(`/products?featured=true&categorySlug=${encodeURIComponent(liveSlug)}&limit=4`),
        ]);

        if (cancelled) return;

        setLiveProducts(productResult.status === "fulfilled" ? (productResult.value || []) : []);
        setFeatured(featuredResult.status === "fulfilled" ? (featuredResult.value || []) : []);
        setLiveRailUnavailable(productResult.status === "rejected");

        const failedRequest =
          productResult.status === "rejected"
            ? productResult.reason
            : (featuredResult.status === "rejected" ? featuredResult.reason : null);
        setTechnicalError(failedRequest ? toTechnicalBannerMessage(failedRequest) : "");
      } catch (error) {
        if (cancelled) return;
        setCategories([]);
        setLiveProducts([]);
        setFeatured([]);
        setLiveRailUnavailable(false);
        setTechnicalError(toTechnicalBannerMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const topHighlights = useMemo(() => categories.slice(0, 8), [categories]);
  const liveCategory = categories.find((item) => item.categorySlug === PRIMARY_MERCH_CATEGORY_SLUG) || null;
  const liveHref = liveCategory?.href || "#categories";
  const primaryCtaLabel = liveCategory ? `Shop ${liveCategory.label}` : "Browse Categories";

  return (
    <div>
      <section className="hero">
        <div className="hero__content">
          <div className="hero__eyebrow">Category First Luxury Storefront</div>
          <h1 className="hero__title">Celebrate every drape with a commerce experience built like Siri Collections.</h1>
          <p className="hero__copy">
            Browse blouse stories first, discover upcoming categories as they launch, and keep your cart ready for a smoother checkout the moment customer login arrives.
          </p>
          <div className="hero__actions">
            <Link href={liveHref} className="primary-button">
              {primaryCtaLabel}
            </Link>
            <Link href="#categories" className="secondary-button">
              Explore Categories
            </Link>
          </div>
        </div>
        <div className="hero__visual" />
      </section>

      {loading ? <div className="section-copy" style={{ marginTop: 24 }}>Loading storefront…</div> : null}
      {technicalError ? <div className="status-banner status-banner--error" style={{ marginTop: 24 }}>{technicalError}</div> : null}

      <section className="section" id="categories">
        <div className="section-header">
          <div>
            <div className="section-kicker">Browse by Category</div>
            <h2 className="section-title">All Collections Stay Visible</h2>
          </div>
          <p className="section-copy">Categories come from the active category tree. Blouse and Mangalsutra are live now; the rest stay published as coming-soon destinations.</p>
        </div>
        <div className="category-grid">
          {topHighlights.map((category) => (
            <Link key={`${category.href}-${category.label}`} href={category.href} className="category-card">
              <div className="category-card__meta">
                <span className="section-kicker">{category.categorySlug || "collection"}</span>
                {!category.isLive ? <span className="category-card__badge">Coming Soon</span> : null}
              </div>
              <div className="category-card__title">{category.label}</div>
              <p className="section-copy">
                {category.isLive
                  ? `Browse the live ${category.label.toLowerCase()} catalog with full listing and product detail support.`
                  : "This category remains visible in the menu and opens a branded coming-soon page until merchandise is launched."}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <div className="section-kicker">Live Inventory</div>
            <h2 className="section-title">{getLiveInventoryTitle(categories, liveCategory?.href || "")}</h2>
          </div>
          <Link href={liveHref} className="secondary-button">{liveCategory ? "View All" : "Browse Categories"}</Link>
        </div>
        {liveRailUnavailable ? (
          <div className="status-banner status-banner--error">
            The live blouse rail is temporarily unavailable while the storefront backend recovers.
          </div>
        ) : liveProducts.length ? (
          <div className="card-grid">
            {liveProducts.map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        ) : (
          <div className="coming-soon">
            <div className="status-soon">Coming Soon</div>
            <h3 className="coming-soon__title">The live blouse rail will appear here when merchandise is available.</h3>
            <p className="coming-soon__copy">
              If the primary live category has no products available yet, the storefront stays intact and waits for the catalog to go live.
            </p>
          </div>
        )}
      </section>

      {liveCategory && featured.length ? (
        <section className="section">
          <div className="section-header">
            <div>
              <div className="section-kicker">Featured Picks</div>
              <h2 className="section-title">You May Also Like</h2>
            </div>
          </div>
          <div className="card-grid">
            {featured.map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
