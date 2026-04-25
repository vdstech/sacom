"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { fetchCategoryTree, fetchStore, type ProductListItem, type StoreCategoryNode } from "@/lib/storeApi";
import { categoryHref, flattenCategories, normalizeCategorySlug, toTechnicalBannerMessage } from "@/lib/storefront";
import { STOREFRONT_STRINGS } from "@/lib/strings";

const PAGE_SIZE = 12;

function buildCategoryHrefMap(tree: StoreCategoryNode[]): Map<string, string> {
  return new Map<string, string>(
    flattenCategories(tree, [])
      .filter((node) => !!node.slug)
      .map((node) => [normalizeCategorySlug(node.slug), categoryHref(node)])
  );
}

export default function NewArrivalsPage() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categoryHrefMap, setCategoryHrefMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [technicalError, setTechnicalError] = useState("");
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setTechnicalError("");
        setPage(1);
        setHasMore(false);
        setProducts([]);

        const [tree, latestProducts] = await Promise.all([
          fetchCategoryTree(),
          fetchStore<ProductListItem[]>(`/products?page=1&limit=${PAGE_SIZE}`),
        ]);

        if (cancelled) return;
        setCategoryHrefMap(buildCategoryHrefMap(tree));
        setProducts(latestProducts || []);
        setHasMore((latestProducts || []).length === PAGE_SIZE);
      } catch (error) {
        if (cancelled) return;
        setProducts([]);
        setHasMore(false);
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

  useEffect(() => {
    if (page <= 1) return;
    let cancelled = false;

    async function loadMore() {
      try {
        setLoadingMore(true);
        const nextProducts = await fetchStore<ProductListItem[]>(`/products?page=${page}&limit=${PAGE_SIZE}`);
        if (cancelled) return;

        setProducts((current) => {
          const seen = new Set(current.map((item) => item._id));
          return [...current, ...(nextProducts || []).filter((item) => !seen.has(item._id))];
        });
        setHasMore((nextProducts || []).length === PAGE_SIZE);
      } catch (error) {
        if (cancelled) return;
        setHasMore(false);
        setTechnicalError(toTechnicalBannerMessage(error));
      } finally {
        loadingMoreRef.current = false;
        if (!cancelled) setLoadingMore(false);
      }
    }

    loadMore();
    return () => {
      cancelled = true;
    };
  }, [page]);

  useEffect(() => {
    if (loading || !hasMore) return;
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingMoreRef.current || !hasMoreRef.current) return;
        loadingMoreRef.current = true;
        setPage((current) => current + 1);
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  const cards = useMemo(() => (
    products.map((product) => {
      const categorySlug = normalizeCategorySlug(product.categorySlug);
      const href = categoryHrefMap.get(categorySlug) || (categorySlug ? `/c/${categorySlug}` : "");
      return (
        <div key={product._id} className="product-card-stack">
          <ProductCard product={product} />
          {href ? (
            <Link href={href} className="product-card-stack__meta">
              {STOREFRONT_STRINGS.newArrivals.browseCategory(product.categorySlug || STOREFRONT_STRINGS.brand.fallbackCategoryLabel)}
            </Link>
          ) : null}
        </div>
      );
    })
  ), [categoryHrefMap, products]);

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <div className="section-kicker">{STOREFRONT_STRINGS.home.newArrivals}</div>
          <h1 className="section-title">{STOREFRONT_STRINGS.newArrivals.title}</h1>
        </div>
      </div>

      <p className="section-copy">{STOREFRONT_STRINGS.newArrivals.subtitle}</p>
      {loading ? <div className="section-copy">{STOREFRONT_STRINGS.newArrivals.loading}</div> : null}
      {technicalError ? <div className="status-banner status-banner--error">{technicalError}</div> : null}

      {!loading && products.length ? (
        <div className="card-grid">{cards}</div>
      ) : null}

      {!loading && !products.length ? (
        <div className="coming-soon">
          <h2 className="coming-soon__title">{STOREFRONT_STRINGS.newArrivals.emptyTitle}</h2>
          <p className="coming-soon__copy">{STOREFRONT_STRINGS.newArrivals.emptyCopy}</p>
        </div>
      ) : null}

      {hasMore ? <div ref={loadMoreTriggerRef} className="listing-sentinel" aria-hidden="true" /> : null}
      {loadingMore ? <div className="section-copy listing-status">{STOREFRONT_STRINGS.category.loadingMore}</div> : null}
    </section>
  );
}
