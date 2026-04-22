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
import { STOREFRONT_STRINGS } from "@/lib/strings";

type CategorySpotlight = {
  label: string;
  href: string;
  categorySlug?: string;
  isLive: boolean;
};

function getLiveInventoryTitle(categories: CategorySpotlight[], liveHref = "") {
  const liveCategory = categories.find((item) => item.href === liveHref);
  return liveCategory?.label || STOREFRONT_STRINGS.home.selectedCollection;
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
  const primaryCtaLabel = liveCategory ? `Shop ${liveCategory.label}` : STOREFRONT_STRINGS.home.browseCategories;

  return (
    <div>
      <section className="hero">
        <div className="hero__content">
          <div className="hero__eyebrow">{STOREFRONT_STRINGS.home.heroEyebrow}</div>
          <h1 className="hero__title">{STOREFRONT_STRINGS.home.heroTitle}</h1>
          <p className="hero__copy">{STOREFRONT_STRINGS.home.heroCopy}</p>
          <div className="hero__actions">
            <Link href={liveHref} className="primary-button">
              {primaryCtaLabel}
            </Link>
            <Link href="#categories" className="secondary-button">
              {STOREFRONT_STRINGS.home.exploreCategories}
            </Link>
          </div>
        </div>
        <div className="hero__visual" />
      </section>

      {loading ? <div className="section-copy" style={{ marginTop: 24 }}>{STOREFRONT_STRINGS.home.loading}</div> : null}
      {technicalError ? <div className="status-banner status-banner--error" style={{ marginTop: 24 }}>{technicalError}</div> : null}

      <section className="section" id="categories">
        <div className="section-header">
          <div>
            <div className="section-kicker">{STOREFRONT_STRINGS.home.browseByCategory}</div>
            <h2 className="section-title">{STOREFRONT_STRINGS.home.allCollectionsStayVisible}</h2>
          </div>
          <p className="section-copy">{STOREFRONT_STRINGS.home.categoryTreeCopy}</p>
        </div>
        <div className="category-grid">
          {topHighlights.map((category) => (
            <Link key={`${category.href}-${category.label}`} href={category.href} className="category-card">
              <div className="category-card__meta">
                <span className="section-kicker">{category.categorySlug || STOREFRONT_STRINGS.brand.fallbackCategorySlug}</span>
                {!category.isLive ? <span className="category-card__badge">{STOREFRONT_STRINGS.category.comingSoon}</span> : null}
              </div>
              <div className="category-card__title">{category.label}</div>
              <p className="section-copy">
                {category.isLive
                  ? STOREFRONT_STRINGS.home.liveCategoryCopy(category.label)
                  : STOREFRONT_STRINGS.home.upcomingCategoryCopy}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
            <div>
            <div className="section-kicker">{STOREFRONT_STRINGS.home.liveInventory}</div>
            <h2 className="section-title">{getLiveInventoryTitle(categories, liveCategory?.href || "")}</h2>
          </div>
          <Link href={liveHref} className="secondary-button">{liveCategory ? STOREFRONT_STRINGS.home.viewAll : STOREFRONT_STRINGS.home.browseCategories}</Link>
        </div>
        {liveRailUnavailable ? (
          <div className="status-banner status-banner--error">
            {STOREFRONT_STRINGS.home.liveRailUnavailable}
          </div>
        ) : liveProducts.length ? (
          <div className="card-grid">
            {liveProducts.map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        ) : (
          <div className="coming-soon">
            <div className="status-soon">{STOREFRONT_STRINGS.category.comingSoon}</div>
            <h3 className="coming-soon__title">{STOREFRONT_STRINGS.home.liveRailComingSoonTitle}</h3>
            <p className="coming-soon__copy">{STOREFRONT_STRINGS.home.liveRailComingSoonCopy}</p>
          </div>
        )}
      </section>

      {liveCategory && featured.length ? (
        <section className="section">
          <div className="section-header">
            <div>
              <div className="section-kicker">{STOREFRONT_STRINGS.home.featuredPicks}</div>
              <h2 className="section-title">{STOREFRONT_STRINGS.home.youMayAlsoLike}</h2>
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
