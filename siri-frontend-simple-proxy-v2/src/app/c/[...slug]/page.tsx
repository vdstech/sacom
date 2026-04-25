"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/ProductCard";
import {
  CategoryFacet,
  fetchCategoryTree,
  fetchStore,
  type ProductListItem,
  type StoreCategoryNode,
  type StorePriceRange,
} from "@/lib/storeApi";
import {
  categoryHref,
  findCategoryNodeByPath,
  normalizeCategorySlug,
  toTechnicalBannerMessage,
} from "@/lib/storefront";
import { formatMoney } from "@/lib/pricing";
import { STOREFRONT_STRINGS } from "@/lib/strings";

const PINNED_FACET_ORDER = ["work", "color", "size", "fabric"];
const PRODUCTS_PAGE_SIZE = 12;

function normalizeFacetLabel(value: string) {
  return String(value || "").trim().toLowerCase();
}

function readPositiveNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function clampPrice(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildProductQuery(
  categorySlug: string,
  activeFacetMap: Map<string, string[]>,
  searchParams: Pick<URLSearchParams, "get">,
  options: { page?: number; limit?: number; includeDescendants?: boolean } = {}
) {
  const query = new URLSearchParams();
  query.set("categorySlug", categorySlug);
  if (options.includeDescendants) query.set("includeDescendants", "true");

  for (const [key, values] of activeFacetMap.entries()) {
    if (values.length) query.set(`facet.${key}`, values.join(","));
  }

  const minPrice = readPositiveNumber(searchParams.get("minPrice"));
  const maxPrice = readPositiveNumber(searchParams.get("maxPrice"));
  if (minPrice !== null) query.set("minPrice", String(minPrice));
  if (maxPrice !== null) query.set("maxPrice", String(maxPrice));
  if (options.page) query.set("page", String(options.page));
  if (options.limit) query.set("limit", String(options.limit));

  return query;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="filter-search__icon">
      <path
        d="M8.5 3a5.5 5.5 0 1 0 3.48 9.76l3.13 3.13a.75.75 0 1 0 1.06-1.06l-3.13-3.13A5.5 5.5 0 0 0 8.5 3Zm0 1.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function CategoryPage() {
  const params = useParams<{ slug?: string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slugParts = Array.isArray(params?.slug) ? params.slug : [];
  const routePath = `/c/${slugParts.join("/")}`;

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [featured, setFeatured] = useState<ProductListItem[]>([]);
  const [facets, setFacets] = useState<CategoryFacet[]>([]);
  const [priceRange, setPriceRange] = useState<StorePriceRange | null>(null);
  const [selectedPriceRange, setSelectedPriceRange] = useState<StorePriceRange | null>(null);
  const [categoryNode, setCategoryNode] = useState<StoreCategoryNode | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [page, setPage] = useState(1);
  const [technicalError, setTechnicalError] = useState("");
  const [facetSearch, setFacetSearch] = useState<Record<string, string>>({});
  const [currentListingSlug, setCurrentListingSlug] = useState("");
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const listingContextRef = useRef("");
  const loadingMoreRef = useRef(false);
  const hasMoreProductsRef = useRef(false);
  const searchKey = searchParams.toString();
  const listingContextKey = `${routePath}?${searchKey}`;

  const activeFacetMap = useMemo(() => {
    const entries = Array.from(searchParams.entries()).filter(([key, value]) => key.startsWith("facet.") && value);
    return new Map(entries.map(([key, value]) => [key.slice("facet.".length), value.split(",").filter(Boolean)]));
  }, [searchParams]);

  const orderedFacets = useMemo(() => {
    const pinned: CategoryFacet[] = [];
    const remaining: CategoryFacet[] = [];
    const used = new Set<string>();

    for (const desired of PINNED_FACET_ORDER) {
      const match = facets.find((facet) => normalizeFacetLabel(facet.label) === desired);
      if (match) {
        pinned.push(match);
        used.add(match.key);
      }
    }

    for (const facet of facets) {
      if (!used.has(facet.key)) remaining.push(facet);
    }

    return [...pinned, ...remaining];
  }, [facets]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  useEffect(() => {
    hasMoreProductsRef.current = hasMoreProducts;
  }, [hasMoreProducts]);

  useEffect(() => {
    if (!slugParts.length) return;
    let cancelled = false;

    async function load() {
      try {
        listingContextRef.current = listingContextKey;
        setLoading(true);
        setLoadingMore(false);
        setHasMoreProducts(false);
        setPage(1);
        setTechnicalError("");
        setNotFound(false);
        setCatalogUnavailable(false);
        setProducts([]);
        setFeatured([]);
        setFacets([]);
        setPriceRange(null);
        setCurrentListingSlug("");
        loadingMoreRef.current = false;
        hasMoreProductsRef.current = false;

        const categoryTree = await fetchCategoryTree();
        if (cancelled || listingContextRef.current !== listingContextKey) return;

        const matchedNode = findCategoryNodeByPath(categoryTree, routePath);
        if (!matchedNode) {
          setCategoryNode(null);
          setNotFound(true);
          return;
        }

        setCategoryNode(matchedNode);
        const listingSlug = normalizeCategorySlug(matchedNode.slug);
        if (!listingSlug) {
          return;
        }

        const listingQuery = buildProductQuery(listingSlug, activeFacetMap, searchParams, {
          page: 1,
          limit: PRODUCTS_PAGE_SIZE,
          includeDescendants: true,
        });
        const facetQuery = buildProductQuery(listingSlug, activeFacetMap, searchParams, {
          includeDescendants: true,
        });
        setCurrentListingSlug(listingSlug);
        const [listingResult, facetResult, featuredResult] = await Promise.allSettled([
          fetchStore<ProductListItem[]>(`/products?${listingQuery.toString()}`),
          fetchStore<{ facets?: CategoryFacet[]; priceRange?: StorePriceRange | null }>(`/products/facets?${facetQuery.toString()}`),
          fetchStore<ProductListItem[]>(
            `/products?featured=true&categorySlug=${encodeURIComponent(listingSlug)}&includeDescendants=true&limit=4`
          ),
        ]);

        if (cancelled || listingContextRef.current !== listingContextKey) return;
        if (listingResult.status === "rejected") {
          throw listingResult.reason;
        }

        const initialProducts = listingResult.value || [];
        setProducts(initialProducts);
        setHasMoreProducts(initialProducts.length === PRODUCTS_PAGE_SIZE);
        setFacets(
          facetResult.status === "fulfilled" && Array.isArray(facetResult.value?.facets)
            ? facetResult.value.facets
            : []
        );
        setPriceRange(
          facetResult.status === "fulfilled" &&
            facetResult.value?.priceRange &&
            Number.isFinite(Number(facetResult.value.priceRange.min)) &&
            Number.isFinite(Number(facetResult.value.priceRange.max))
            ? {
                min: Number(facetResult.value.priceRange.min),
                max: Number(facetResult.value.priceRange.max),
              }
            : null
        );
        setFeatured(featuredResult.status === "fulfilled" ? (featuredResult.value || []) : []);

        const optionalFailure =
          facetResult.status === "rejected"
            ? facetResult.reason
            : (featuredResult.status === "rejected" ? featuredResult.reason : null);
        setTechnicalError(optionalFailure ? toTechnicalBannerMessage(optionalFailure) : "");
      } catch (error) {
        if (cancelled || listingContextRef.current !== listingContextKey) return;
        setCatalogUnavailable(true);
        setCurrentListingSlug("");
        setHasMoreProducts(false);
        setTechnicalError(toTechnicalBannerMessage(error));
      } finally {
        if (!cancelled && listingContextRef.current === listingContextKey) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [routePath, slugParts, activeFacetMap, listingContextKey, searchParams]);

  useEffect(() => {
    if (!currentListingSlug || page <= 1 || loading || catalogUnavailable) return;
    let cancelled = false;

    async function loadMoreProducts() {
      try {
        setLoadingMore(true);
        const nextQuery = buildProductQuery(currentListingSlug, activeFacetMap, searchParams, {
          page,
          limit: PRODUCTS_PAGE_SIZE,
          includeDescendants: true,
        });
        const nextProducts = await fetchStore<ProductListItem[]>(`/products?${nextQuery.toString()}`);
        if (cancelled || listingContextRef.current !== listingContextKey) return;

        setProducts((current) => {
          const seen = new Set(current.map((product) => product._id));
          return [...current, ...(nextProducts || []).filter((product) => !seen.has(product._id))];
        });
        setHasMoreProducts((nextProducts || []).length === PRODUCTS_PAGE_SIZE);
      } catch (error) {
        if (cancelled || listingContextRef.current !== listingContextKey) return;
        setHasMoreProducts(false);
        setTechnicalError(toTechnicalBannerMessage(error));
      } finally {
        loadingMoreRef.current = false;
        if (!cancelled && listingContextRef.current === listingContextKey) {
          setLoadingMore(false);
        }
      }
    }

    loadMoreProducts();
    return () => {
      cancelled = true;
    };
  }, [activeFacetMap, catalogUnavailable, currentListingSlug, listingContextKey, loading, page, searchParams]);

  useEffect(() => {
    if (!currentListingSlug || loading || catalogUnavailable || !hasMoreProducts) return;
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingMoreRef.current || !hasMoreProductsRef.current) return;
        loadingMoreRef.current = true;
        setPage((current) => current + 1);
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [catalogUnavailable, currentListingSlug, hasMoreProducts, loading]);

  useEffect(() => {
    if (!priceRange) {
      setSelectedPriceRange(null);
      return;
    }

    const nextMin = clampPrice(
      readPositiveNumber(searchParams.get("minPrice")) ?? priceRange.min,
      priceRange.min,
      priceRange.max
    );
    const nextMax = clampPrice(
      readPositiveNumber(searchParams.get("maxPrice")) ?? priceRange.max,
      priceRange.min,
      priceRange.max
    );

    setSelectedPriceRange({
      min: Math.min(nextMin, nextMax),
      max: Math.max(nextMin, nextMax),
    });
  }, [priceRange, searchKey, searchParams]);

  useEffect(() => {
    if (!priceRange || !selectedPriceRange) return;

    const currentMin = clampPrice(
      readPositiveNumber(searchParams.get("minPrice")) ?? priceRange.min,
      priceRange.min,
      priceRange.max
    );
    const currentMax = clampPrice(
      readPositiveNumber(searchParams.get("maxPrice")) ?? priceRange.max,
      priceRange.min,
      priceRange.max
    );
    const nextMin = clampPrice(selectedPriceRange.min, priceRange.min, priceRange.max);
    const nextMax = clampPrice(selectedPriceRange.max, priceRange.min, priceRange.max);

    if (currentMin === nextMin && currentMax === nextMax) return;

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (nextMin <= priceRange.min) next.delete("minPrice");
      else next.set("minPrice", String(nextMin));

      if (nextMax >= priceRange.max) next.delete("maxPrice");
      else next.set("maxPrice", String(nextMax));

      const nextQuery = next.toString();
      router.push(nextQuery ? `${routePath}?${nextQuery}` : routePath);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [priceRange, routePath, router, searchParams, selectedPriceRange]);

  const toggleFacet = (facetKey: string, optionValue: string) => {
    const next = new URLSearchParams(searchParams.toString());
    const current = new Set((activeFacetMap.get(facetKey) || []).map((value) => String(value)));
    if (current.has(optionValue)) current.delete(optionValue);
    else current.add(optionValue);
    if (current.size) next.set(`facet.${facetKey}`, Array.from(current).join(","));
    else next.delete(`facet.${facetKey}`);
    router.push(`${routePath}?${next.toString()}`);
  };

  const toggleBooleanFacet = (facetKey: string, checked: boolean) => {
    const next = new URLSearchParams(searchParams.toString());
    if (checked) next.set(`facet.${facetKey}`, "true");
    else next.delete(`facet.${facetKey}`);
    router.push(`${routePath}?${next.toString()}`);
  };

  const heading = categoryNode?.name || normalizeCategorySlug(slugParts[slugParts.length - 1]).replace(/[-_]/g, " ") || "Collection";
  const childCategories = categoryNode?.children || [];
  const priceSliderSpread = priceRange ? Math.max(priceRange.max - priceRange.min, 0) : 0;
  const priceSliderStep = priceRange
    ? priceSliderSpread <= 100
      ? 1
      : priceSliderSpread <= 1000
        ? 10
        : 50
    : 1;
  const selectedMin = selectedPriceRange?.min ?? priceRange?.min ?? 0;
  const selectedMax = selectedPriceRange?.max ?? priceRange?.max ?? 0;
  const minPercent = priceRange && priceSliderSpread > 0
    ? ((selectedMin - priceRange.min) / priceSliderSpread) * 100
    : 0;
  const maxPercent = priceRange && priceSliderSpread > 0
    ? ((selectedMax - priceRange.min) / priceSliderSpread) * 100
    : 100;

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <div className="section-kicker">Collection</div>
          <h1 className="section-title" style={{ textTransform: "capitalize" }}>{heading}</h1>
        </div>
      </div>

      {loading ? <div className="section-copy">Loading category…</div> : null}
      {technicalError ? <div className="status-banner status-banner--error">{technicalError}</div> : null}

      {!loading && notFound ? (
        <div className="coming-soon">
          <div className="status-soon">{STOREFRONT_STRINGS.category.notFound}</div>
          <h2 className="coming-soon__title">{STOREFRONT_STRINGS.category.notFoundTitle}</h2>
          <p className="coming-soon__copy">{STOREFRONT_STRINGS.category.notFoundCopy}</p>
        </div>
      ) : null}

      {!loading && categoryNode ? (
        catalogUnavailable ? (
          <div className="status-banner status-banner--error">
            {STOREFRONT_STRINGS.category.listingUnavailable}
          </div>
        ) : (
          <div className="listing-shell">
            {childCategories.length ? (
              <section className="subcategory-strip">
                <div className="section-header">
                  <div>
                    <div className="section-kicker">{STOREFRONT_STRINGS.category.subcategories}</div>
                    <h2 className="section-title">{STOREFRONT_STRINGS.category.subcategoriesTitle}</h2>
                  </div>
                  <p className="section-copy">{STOREFRONT_STRINGS.category.subcategoriesCopy}</p>
                </div>
                <div className="category-grid">
                  {childCategories.map((node) => (
                    <Link key={node._id} href={categoryHref(node)} className="category-card">
                      <div className="category-card__meta">
                        <span className="section-kicker">{node.slug || STOREFRONT_STRINGS.brand.fallbackCategorySlug}</span>
                      </div>
                      <div className="category-card__title">{node.name}</div>
                      <p className="section-copy">{STOREFRONT_STRINGS.category.viewSubcategory(node.name)}</p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="listing-layout">
              <aside className="filter-panel">
                <div className="section-kicker">{STOREFRONT_STRINGS.category.filters}</div>
                <div className="filters-grid">
                  {priceRange ? (
                    <div className="filter-group filter-group--price">
                      <div className="filter-group__header">
                        <h3>{STOREFRONT_STRINGS.category.price}</h3>
                      </div>
                      <div className="price-filter">
                        <div className="price-filter__values">
                          <strong>{formatMoney(selectedMin)}</strong>
                          <span>to</span>
                          <strong>{formatMoney(selectedMax)}</strong>
                        </div>
                        <div className="price-filter__slider">
                          <div className="price-filter__slider-base" />
                          <div
                            className="price-filter__slider-active"
                            style={{
                              left: `${minPercent}%`,
                              width: `${Math.max(maxPercent - minPercent, 0)}%`,
                            }}
                          />
                          <input
                            type="range"
                            min={priceRange.min}
                            max={priceRange.max}
                            step={priceSliderStep}
                            value={selectedMin}
                            aria-label="Minimum price"
                            onChange={(event) => {
                              const nextMin = Math.min(Number(event.target.value), selectedMax);
                              setSelectedPriceRange({ min: nextMin, max: Math.max(selectedMax, nextMin) });
                            }}
                          />
                          <input
                            type="range"
                            min={priceRange.min}
                            max={priceRange.max}
                            step={priceSliderStep}
                            value={selectedMax}
                            aria-label="Maximum price"
                            onChange={(event) => {
                              const nextMax = Math.max(Number(event.target.value), selectedMin);
                              setSelectedPriceRange({ min: Math.min(selectedMin, nextMax), max: nextMax });
                            }}
                          />
                        </div>
                        <div className="price-filter__bounds">
                          <span>{formatMoney(priceRange.min)}</span>
                          <span>{formatMoney(priceRange.max)}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {orderedFacets.map((facet) => (
                    <div key={facet.key} className="filter-group">
                      <div className="filter-group__header">
                        <h3>{facet.label}</h3>
                        {facet.type === "boolean" ? null : (
                          <label className="filter-search">
                            <SearchIcon />
                            <input
                              type="text"
                              value={facetSearch[facet.key] || ""}
                              onChange={(event) => {
                                const value = event.target.value;
                                setFacetSearch((current) => ({ ...current, [facet.key]: value }));
                              }}
                              placeholder={STOREFRONT_STRINGS.category.searchPlaceholder(facet.label)}
                              aria-label={`Search ${facet.label}`}
                            />
                          </label>
                        )}
                      </div>
                      {facet.type === "boolean" ? (
                        <label className="filter-option">
                          <span className="filter-option__main">
                            <input
                              type="checkbox"
                              checked={(activeFacetMap.get(facet.key) || []).includes("true")}
                              onChange={(event) => toggleBooleanFacet(facet.key, event.target.checked)}
                            />
                            <span>{facet.label}</span>
                          </span>
                          <strong>{facet.options[0]?.count || 0}</strong>
                        </label>
                      ) : (
                        <div className="filter-option-list">
                          {facet.options
                            .filter((option) => {
                              const searchValue = String(facetSearch[facet.key] || "").trim().toLowerCase();
                              if (!searchValue) return true;
                              return option.label.toLowerCase().includes(searchValue);
                            })
                            .map((option) => {
                            const active = (activeFacetMap.get(facet.key) || []).includes(option.value);
                            return (
                              <label
                                key={`${facet.key}-${option.value}`}
                                className={`filter-option ${active ? "is-active" : ""}`}
                              >
                                <span className="filter-option__main">
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggleFacet(facet.key, option.value)}
                                  />
                                  <span>{option.label}</span>
                                </span>
                                <strong>{option.count}</strong>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  {!facets.length ? <div className="section-copy">{STOREFRONT_STRINGS.category.noFilters}</div> : null}
                </div>
              </aside>

              <div>
                {products.length ? (
                  <div className="listing-results">
                    <div className="card-grid">
                      {products.map((product) => <ProductCard key={product._id} product={product} />)}
                    </div>
                    {hasMoreProducts ? <div ref={loadMoreTriggerRef} className="listing-sentinel" aria-hidden="true" /> : null}
                    {loadingMore ? <div className="section-copy listing-status">{STOREFRONT_STRINGS.category.loadingMore}</div> : null}
                  </div>
                ) : (
                  <div className="coming-soon">
                    <div className="status-soon">{STOREFRONT_STRINGS.category.comingSoon}</div>
                    <h2 className="coming-soon__title">{STOREFRONT_STRINGS.category.emptyListingTitle(heading)}</h2>
                    <p className="coming-soon__copy">{STOREFRONT_STRINGS.category.emptyListingCopy}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      ) : null}

      {!loading && categoryNode && featured.length ? (
        <section className="section">
          <div className="section-header">
            <div>
              <div className="section-kicker">{STOREFRONT_STRINGS.category.featuredPicks}</div>
              <h2 className="section-title">{STOREFRONT_STRINGS.category.youMayAlsoLike}</h2>
            </div>
          </div>
          <div className="card-grid">
            {featured.map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        </section>
      ) : null}

      <div className="section">
        <Link href="/" className="secondary-button">{STOREFRONT_STRINGS.category.backToHome}</Link>
      </div>
    </div>
  );
}
