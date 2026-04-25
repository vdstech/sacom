"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { fetchCategoryTree, fetchStore, type ProductListItem, type StoreCategoryNode } from "@/lib/storeApi";
import { categoryHref, toTechnicalBannerMessage } from "@/lib/storefront";
import { STOREFRONT_STRINGS } from "@/lib/strings";

const NEW_ARRIVALS_LIMIT = 8;
const CATEGORY_RAIL_LIMIT = 4;
const MAX_CATEGORY_RAILS = 3;
const MAX_CATEGORY_RAIL_CANDIDATES = 6;

type CategorySpotlight = {
  label: string;
  href: string;
  categorySlug?: string;
  childCount: number;
};

type CategoryRail = {
  label: string;
  href: string;
  categorySlug?: string;
  products: ProductListItem[];
};

function toSpotlight(node: StoreCategoryNode): CategorySpotlight {
  return {
    label: node.name,
    href: categoryHref(node),
    categorySlug: node.slug,
    childCount: node.children?.length || 0,
  };
}

export default function Page() {
  const [newArrivals, setNewArrivals] = useState<ProductListItem[]>([]);
  const [spotlights, setSpotlights] = useState<CategorySpotlight[]>([]);
  const [categoryRails, setCategoryRails] = useState<CategoryRail[]>([]);
  const [loading, setLoading] = useState(true);
  const [technicalError, setTechnicalError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setTechnicalError("");

        const tree = await fetchCategoryTree();
        if (cancelled) return;

        const topLevelNodes = tree.filter((node) => !!node.slug && !!node.path);
        const railCandidates = topLevelNodes.slice(0, MAX_CATEGORY_RAIL_CANDIDATES);
        const nextSpotlights = topLevelNodes.map(toSpotlight);
        setSpotlights(nextSpotlights);

        const [newArrivalsResult, ...railResults] = await Promise.allSettled([
          fetchStore<ProductListItem[]>(`/products?limit=${NEW_ARRIVALS_LIMIT}`),
          ...railCandidates.map(async (node) => ({
            label: node.name,
            href: categoryHref(node),
            categorySlug: node.slug,
            products: await fetchStore<ProductListItem[]>(
              `/products?categorySlug=${encodeURIComponent(String(node.slug || ""))}&includeDescendants=true&limit=${CATEGORY_RAIL_LIMIT}`
            ),
          })),
        ]);

        if (cancelled) return;

        setNewArrivals(newArrivalsResult.status === "fulfilled" ? (newArrivalsResult.value || []) : []);
        setCategoryRails(
          railResults
            .filter((result): result is PromiseFulfilledResult<CategoryRail> => result.status === "fulfilled")
            .map((result) => result.value)
            .filter((rail) => rail.products.length)
            .slice(0, MAX_CATEGORY_RAILS)
        );

        const firstFailure = [newArrivalsResult, ...railResults].find((result) => result.status === "rejected");
        setTechnicalError(
          firstFailure && firstFailure.status === "rejected"
            ? toTechnicalBannerMessage(firstFailure.reason)
            : ""
        );
      } catch (error) {
        if (cancelled) return;
        setSpotlights([]);
        setNewArrivals([]);
        setCategoryRails([]);
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

  return (
    <div>
      <section className="hero hero--editorial">
        <div className="hero__content">
          <div className="hero__eyebrow">{STOREFRONT_STRINGS.home.heroEyebrow}</div>
          <h1 className="hero__title">{STOREFRONT_STRINGS.home.heroTitle}</h1>
          <p className="hero__copy">{STOREFRONT_STRINGS.home.heroCopy}</p>
          <div className="hero__actions">
            <Link href="/new-arrivals" className="primary-button">
              {STOREFRONT_STRINGS.navigation.newArrivals}
            </Link>
            <Link href="#collections" className="secondary-button">
              {STOREFRONT_STRINGS.home.exploreCategories}
            </Link>
          </div>
        </div>
        <div className="hero__visual hero__visual--editorial">
          <div className="hero-panel">
            <span className="section-kicker">{STOREFRONT_STRINGS.home.newArrivals}</span>
            <strong>{STOREFRONT_STRINGS.home.newArrivalsTitle}</strong>
            <p>{STOREFRONT_STRINGS.home.newArrivalsCopy}</p>
          </div>
          <div className="hero-panel hero-panel--muted">
            <span className="section-kicker">{STOREFRONT_STRINGS.home.featuredCollections}</span>
            <strong>{STOREFRONT_STRINGS.home.featuredCollectionsTitle}</strong>
            <p>{STOREFRONT_STRINGS.home.featuredCollectionsCopy}</p>
          </div>
        </div>
      </section>

      {loading ? <div className="section-copy" style={{ marginTop: 24 }}>{STOREFRONT_STRINGS.home.loading}</div> : null}
      {technicalError ? <div className="status-banner status-banner--error" style={{ marginTop: 24 }}>{technicalError}</div> : null}

      <section className="section" id="new-arrivals">
        <div className="section-header">
          <div>
            <div className="section-kicker">{STOREFRONT_STRINGS.home.newArrivals}</div>
            <h2 className="section-title">{STOREFRONT_STRINGS.home.newArrivalsTitle}</h2>
          </div>
          <Link href="/new-arrivals" className="secondary-button">{STOREFRONT_STRINGS.home.viewAll}</Link>
        </div>
        <p className="section-copy">{STOREFRONT_STRINGS.home.newArrivalsCopy}</p>
        {newArrivals.length ? (
          <div className="card-grid">
            {newArrivals.map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        ) : !loading ? (
          <div className="coming-soon">
            <h3 className="coming-soon__title">{STOREFRONT_STRINGS.newArrivals.emptyTitle}</h3>
            <p className="coming-soon__copy">{STOREFRONT_STRINGS.newArrivals.emptyCopy}</p>
          </div>
        ) : null}
      </section>

      <section className="section" id="collections">
        <div className="section-header">
          <div>
            <div className="section-kicker">{STOREFRONT_STRINGS.home.browseByCategory}</div>
            <h2 className="section-title">{STOREFRONT_STRINGS.home.allCollectionsStayVisible}</h2>
          </div>
          <p className="section-copy">{STOREFRONT_STRINGS.home.categoryTreeCopy}</p>
        </div>
        <div className="category-grid">
          {spotlights.map((category) => (
            <Link key={`${category.href}-${category.label}`} href={category.href} className="category-card">
              <div className="category-card__meta">
                <span className="section-kicker">{category.categorySlug || STOREFRONT_STRINGS.brand.fallbackCategorySlug}</span>
                <span className="category-card__badge">
                  {category.childCount ? `${category.childCount} subcategories` : "Collection"}
                </span>
              </div>
              <div className="category-card__title">{category.label}</div>
              <p className="section-copy">{STOREFRONT_STRINGS.home.categoryCardCopy}</p>
            </Link>
          ))}
        </div>
      </section>

      {categoryRails.map((rail) => (
        <section className="section" key={`${rail.href}-${rail.label}`}>
          <div className="section-header">
            <div>
              <div className="section-kicker">{STOREFRONT_STRINGS.home.featuredCollections}</div>
              <h2 className="section-title">{rail.label}</h2>
            </div>
            <Link href={rail.href} className="secondary-button">
              {STOREFRONT_STRINGS.home.shopCollection(rail.label)}
            </Link>
          </div>
          <div className="card-grid">
            {rail.products.map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        </section>
      ))}

      <section className="section">
        <div className="section-header">
          <div>
            <div className="section-kicker">{STOREFRONT_STRINGS.home.valuesEyebrow}</div>
            <h2 className="section-title">{STOREFRONT_STRINGS.home.valuesTitle}</h2>
          </div>
        </div>
        <div className="value-strip">
          {STOREFRONT_STRINGS.home.values.map((item) => (
            <article key={item.title} className="value-card">
              <div className="section-kicker">{item.title}</div>
              <p className="section-copy">{item.copy}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
