"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ProductCard } from "@/components/ProductCard";
import { categoryHref, flattenCategories, toTechnicalBannerMessage } from "@/lib/storefront";
import { fetchCategoryTree, fetchStore, type ProductListItem, type StoreCategoryNode } from "@/lib/storeApi";
import { STOREFRONT_STRINGS } from "@/lib/strings";

const NEW_ARRIVALS_LIMIT = 8;
const FEATURED_LIMIT = 4;
const CATEGORY_PREVIEW_LIMIT = 4;
const MAX_CATEGORY_TILES = 8;

type HomeSectionCategoryKey = "sarees" | "jewellery" | "blouses" | "dupatta" | "sale" | "garden_vareli" | "digital_prints" | "other";

type HomeCategoryMeta = {
  key: HomeSectionCategoryKey;
  badge: string;
  description: string;
};

type HomeCollectionTile = {
  key: HomeSectionCategoryKey;
  label: string;
  href: string;
  categorySlug?: string;
  childCount: number;
  imageUrl?: string;
  badge: string;
  description: string;
  products: ProductListItem[];
};

type HomePromoTile = {
  key: string;
  label: string;
  href: string;
  imageUrl?: string;
  badge: string;
};

type HomeHeroSlide = HomePromoTile & {
  headline: string;
  copy: string;
  cta: string;
  visual: "fresh" | "sarees" | "jewellery" | "sale";
  backgroundPosition: string;
  figurePosition: string;
};

type HomeState = {
  loading: boolean;
  technicalError: string;
  newArrivals: ProductListItem[];
  featuredProducts: ProductListItem[];
  collectionTiles: HomeCollectionTile[];
  saleCollection: HomeCollectionTile | null;
  accessoryCollections: HomeCollectionTile[];
  featuredSarees: HomeCollectionTile | null;
};

const INITIAL_STATE: HomeState = {
  loading: true,
  technicalError: "",
  newArrivals: [],
  featuredProducts: [],
  collectionTiles: [],
  saleCollection: null,
  accessoryCollections: [],
  featuredSarees: null,
};

const CATEGORY_PRIORITY: Array<{ key: HomeSectionCategoryKey; keywords: string[]; badge: string; description: string }> = [
  {
    key: "sarees",
    keywords: ["sarees", "saree"],
    badge: "Saree Edit",
    description: "Festive favourites, printed drapes, and everyday saree styles.",
  },
  {
    key: "garden_vareli",
    keywords: ["garden vareli"],
    badge: "Garden Vareli",
    description: "Collection picks from the live Garden Vareli assortment.",
  },
  {
    key: "digital_prints",
    keywords: ["digital prints", "digital print"],
    badge: "Digital Prints",
    description: "Printed boutique styles and modern drapes from live categories.",
  },
  {
    key: "jewellery",
    keywords: ["jewellery", "jewelry", "mangalsutra", "necklace", "bangles", "ear rings", "earrings"],
    badge: "Jewellery",
    description: "Necklace sets, bangles, mangalsutras, and boutique accessories.",
  },
  {
    key: "blouses",
    keywords: ["blouse", "blouses"],
    badge: "Blouses",
    description: "Blouse styles and pairing pieces to complete the look.",
  },
  {
    key: "dupatta",
    keywords: ["dupatta", "dupattas"],
    badge: "Dupatta",
    description: "Layer-friendly dupattas and ethnic accents from live collections.",
  },
  {
    key: "sale",
    keywords: ["half price store", "half-price-store", "sale", "offers", "discount"],
    badge: "Sale",
    description: "Offer-led styles and value finds while current sale collections are live.",
  },
];

function normalizeToken(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function matchesCategory(node: StoreCategoryNode, keywords: string[]) {
  const haystack = [node.name, node.slug, node.path].map(normalizeToken).join(" ");
  return keywords.some((keyword) => haystack.includes(normalizeToken(keyword)));
}

function findPreferredCategory(nodes: StoreCategoryNode[], keywords: string[], usedIds: Set<string>) {
  return nodes.find((node) => !usedIds.has(node._id) && matchesCategory(node, keywords)) || null;
}

function toGenericMeta(node: StoreCategoryNode): HomeCategoryMeta {
  return {
    key: "other",
    badge: node.children?.length ? `${node.children.length} subcategories` : "Collection",
    description: "Browse this collection and shop active styles from the live category branch.",
  };
}

function toCollectionTile(node: StoreCategoryNode, meta: HomeCategoryMeta, products: ProductListItem[]): HomeCollectionTile {
  return {
    key: meta.key,
    label: node.name,
    href: categoryHref(node),
    categorySlug: node.slug,
    childCount: node.children?.length || 0,
    imageUrl: node.imageUrl || products[0]?.defaultVariant?.imageUrl || "",
    badge: meta.badge,
    description: meta.description,
    products,
  };
}

function collectionPreviewQuery(categorySlug: string) {
  return `/products?categorySlug=${encodeURIComponent(categorySlug)}&includeDescendants=true&limit=${CATEGORY_PREVIEW_LIMIT}`;
}

function hasImage(value?: string) {
  return Boolean(String(value || "").trim());
}

export default function Page() {
  const [state, setState] = useState<HomeState>(INITIAL_STATE);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setState((current) => ({ ...current, loading: true, technicalError: "" }));

        const tree = await fetchCategoryTree();
        if (cancelled) return;

        const topLevelNodes = tree.filter((node) => !!node.slug && !!node.path);
        const allNodes = flattenCategories(tree).filter((node) => !!node.slug && !!node.path);
        const usedIds = new Set<string>();

        const prioritizedNodes = CATEGORY_PRIORITY.map((entry) => {
          const match = findPreferredCategory(topLevelNodes, entry.keywords, usedIds)
            || findPreferredCategory(allNodes, entry.keywords, usedIds);
          if (!match) return null;
          usedIds.add(match._id);
          return {
            node: match,
            meta: {
              key: entry.key,
              badge: entry.badge,
              description: entry.description,
            } satisfies HomeCategoryMeta,
          };
        }).filter(Boolean) as Array<{ node: StoreCategoryNode; meta: HomeCategoryMeta }>;

        const fallbackNodes = topLevelNodes
          .filter((node) => !usedIds.has(node._id))
          .map((node) => ({ node, meta: toGenericMeta(node) }));

        const collectionCandidates = [...prioritizedNodes, ...fallbackNodes].slice(0, MAX_CATEGORY_TILES);
        const categoryRequests = collectionCandidates
          .filter((entry) => entry.node.slug)
          .map((entry) => ({
            slug: String(entry.node.slug || ""),
            promise: fetchStore<ProductListItem[]>(collectionPreviewQuery(String(entry.node.slug || ""))),
          }));

        const [newArrivalsResult, featuredResult, ...categoryResults] = await Promise.allSettled([
          fetchStore<ProductListItem[]>(`/products?limit=${NEW_ARRIVALS_LIMIT}`),
          fetchStore<ProductListItem[]>(`/products?featured=true&limit=${FEATURED_LIMIT}`),
          ...categoryRequests.map((entry) => entry.promise),
        ]);

        if (cancelled) return;

        const newArrivals = newArrivalsResult.status === "fulfilled" ? newArrivalsResult.value || [] : [];
        const featuredProducts = featuredResult.status === "fulfilled" ? featuredResult.value || [] : [];

        const productMap = new Map<string, ProductListItem[]>();
        categoryRequests.forEach((entry, index) => {
          const result = categoryResults[index];
          productMap.set(entry.slug, result?.status === "fulfilled" ? result.value || [] : []);
        });

        const collectionTiles = collectionCandidates.map((entry) =>
          toCollectionTile(entry.node, entry.meta, productMap.get(String(entry.node.slug || "")) || [])
        );
        const featuredSarees = collectionTiles.find((collection) => collection.key === "sarees") || null;
        const accessoryCollections = collectionTiles.filter((collection) =>
          collection.key === "jewellery" || collection.key === "blouses" || collection.key === "dupatta"
        );
        const saleCollection = collectionTiles.find((collection) => collection.key === "sale") || null;

        const firstFailure = [newArrivalsResult, featuredResult, ...categoryResults].find((result) => result.status === "rejected");

        setState({
          loading: false,
          technicalError:
            firstFailure && firstFailure.status === "rejected"
              ? toTechnicalBannerMessage(firstFailure.reason)
              : "",
          newArrivals,
          featuredProducts,
          collectionTiles,
          saleCollection,
          accessoryCollections,
          featuredSarees,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          ...INITIAL_STATE,
          loading: false,
          technicalError: toTechnicalBannerMessage(error),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const bannerProduct = useMemo(
    () => state.newArrivals[0] || state.featuredProducts[0] || state.collectionTiles.find((tile) => tile.products.length)?.products[0] || null,
    [state.collectionTiles, state.featuredProducts, state.newArrivals]
  );

  const topCategoryTiles = useMemo(() => {
    const usedKeys = new Set<string>();
    const prioritizedTiles: HomePromoTile[] = [];
    const pushTile = (tile: HomePromoTile | null) => {
      if (!tile || usedKeys.has(tile.key)) return;
      usedKeys.add(tile.key);
      prioritizedTiles.push(tile);
    };

    pushTile({
      key: "fresh",
      label: STOREFRONT_STRINGS.home.newArrivals,
      href: "/new-arrivals",
      imageUrl: state.newArrivals[1]?.defaultVariant?.imageUrl || bannerProduct?.defaultVariant?.imageUrl || "",
      badge: "Fresh Picks",
    });

    pushTile(state.featuredSarees ? {
      key: state.featuredSarees.key,
      label: state.featuredSarees.label,
      href: state.featuredSarees.href,
      imageUrl: state.featuredSarees.imageUrl,
      badge: "Sarees",
    } : null);

    const jewelleryCollection = state.collectionTiles.find((item) => item.key === "jewellery");
    const blouseCollection = state.collectionTiles.find((item) => item.key === "blouses");

    pushTile(jewelleryCollection ? {
      key: jewelleryCollection.key,
      label: jewelleryCollection.label,
      href: jewelleryCollection.href,
      imageUrl: jewelleryCollection.imageUrl,
      badge: "Jewellery",
    } : null);

    pushTile(blouseCollection ? {
      key: blouseCollection.key,
      label: blouseCollection.label,
      href: blouseCollection.href,
      imageUrl: blouseCollection.imageUrl,
      badge: "Blouse",
    } : null);

    pushTile(state.saleCollection ? {
      key: state.saleCollection.key,
      label: state.saleCollection.label,
      href: state.saleCollection.href,
      imageUrl: state.saleCollection.imageUrl,
      badge: "Sale",
    } : null);

    const overflowCollections = state.collectionTiles.filter((item) =>
      item.key !== "sarees" && item.key !== "jewellery" && item.key !== "blouses" && item.key !== "sale"
    );
    overflowCollections.forEach((collection) => {
      pushTile({
        key: collection.key,
        label: collection.label,
        href: collection.href,
        imageUrl: collection.imageUrl,
        badge: collection.badge,
      });
    });

    return prioritizedTiles.filter((tile) => hasImage(tile.imageUrl)).slice(0, 7);
  }, [bannerProduct, state.collectionTiles, state.featuredSarees, state.newArrivals, state.saleCollection]);

  const heroSlides = useMemo(() => {
    const byKey = new Map(topCategoryTiles.map((tile) => [tile.key, tile]));
    const slides: Array<HomeHeroSlide | null> = [
      {
        key: "fresh-slide",
        label: STOREFRONT_STRINGS.home.newArrivals,
        href: "/new-arrivals",
        imageUrl: state.newArrivals[0]?.defaultVariant?.imageUrl || byKey.get("fresh")?.imageUrl || bannerProduct?.defaultVariant?.imageUrl || "",
        badge: "Fresh Picks",
        headline: "Fresh festive styles",
        copy: "Shop new arrivals and boutique picks added to the live catalog.",
        cta: "Shop Now",
        visual: "fresh",
        backgroundPosition: "center top",
        figurePosition: "center top",
      },
      state.featuredSarees ? {
        key: "sarees-slide",
        label: state.featuredSarees.label,
        href: state.featuredSarees.href,
        imageUrl: state.featuredSarees.imageUrl || state.featuredSarees.products[0]?.defaultVariant?.imageUrl || "",
        badge: "Sarees",
        headline: "Sarees for every occasion",
        copy: "Festive drapes, printed edits, and boutique saree styles to wear now.",
        cta: "Explore Collection",
        visual: "sarees",
        backgroundPosition: "center top",
        figurePosition: "center top",
      } : null,
      byKey.get("jewellery") ? {
        key: "jewellery-slide",
        label: byKey.get("jewellery")!.label,
        href: byKey.get("jewellery")!.href,
        imageUrl: byKey.get("jewellery")!.imageUrl || bannerProduct?.defaultVariant?.imageUrl || "",
        badge: "Jewellery",
        headline: "Jewellery that completes the look",
        copy: "Necklace sets, bangles, and occasion accessories from live collections.",
        cta: "Shop Jewellery",
        visual: "jewellery",
        backgroundPosition: "center center",
        figurePosition: "center center",
      } : null,
      state.saleCollection ? {
        key: "sale-slide",
        label: state.saleCollection.label,
        href: state.saleCollection.href,
        imageUrl: state.saleCollection.imageUrl || state.saleCollection.products[0]?.defaultVariant?.imageUrl || "",
        badge: "Half Price Store",
        headline: "Offers worth shopping early",
        copy: "Browse sale edits, offer-led styles, and current half price picks.",
        cta: "Shop Sale",
        visual: "sale",
        backgroundPosition: "center top",
        figurePosition: "center center",
      } : null,
    ];

    return slides.filter((slide): slide is HomeHeroSlide => Boolean(slide && hasImage(slide.imageUrl)));
  }, [bannerProduct, state.featuredSarees, state.newArrivals, state.saleCollection, topCategoryTiles]);

  useEffect(() => {
    setActiveSlide((current) => {
      if (!heroSlides.length) return 0;
      return current >= heroSlides.length ? 0 : current;
    });
  }, [heroSlides.length]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 4500);
    return () => window.clearInterval(intervalId);
  }, [heroSlides.length]);

  const featuredSareeProducts = useMemo(
    () => (state.featuredSarees?.products.length ? state.featuredSarees.products : state.featuredProducts).slice(0, FEATURED_LIMIT),
    [state.featuredProducts, state.featuredSarees]
  );

  const categoryTiles = useMemo(
    () => state.collectionTiles.filter((collection) => hasImage(collection.imageUrl)).slice(0, MAX_CATEGORY_TILES),
    [state.collectionTiles]
  );
  const currentSlide = heroSlides[activeSlide] || heroSlides[0] || null;
  const currentSlideImageStyle = currentSlide
    ? ({
        objectPosition: currentSlide.backgroundPosition,
      } satisfies CSSProperties)
    : undefined;
  const currentSlideFigureStyle = currentSlide
    ? ({
        objectPosition: currentSlide.figurePosition,
      } satisfies CSSProperties)
    : undefined;

  return (
    <div className="home-shell">
      <section className="home-showcase">
        {currentSlide ? (
          <div className="home-carousel">
            {currentSlide.imageUrl ? (
              <>
                <img
                  src={currentSlide.imageUrl}
                  alt=""
                  aria-hidden="true"
                  className={`home-carousel__image home-carousel__image--${currentSlide.visual}`}
                  style={currentSlideImageStyle}
                />
                <div className="home-carousel__figure-wrap" aria-hidden="true">
                  <img
                    src={currentSlide.imageUrl}
                    alt=""
                    className={`home-carousel__figure home-carousel__figure--${currentSlide.visual}`}
                    style={currentSlideFigureStyle}
                  />
                </div>
              </>
            ) : (
              <div className="home-carousel__image home-carousel__image--empty">{currentSlide.label}</div>
            )}
            <div className="home-carousel__scrim" />
            <div className="home-carousel__content">
              <span className="home-carousel__badge">{currentSlide.badge}</span>
              <h1 className="home-carousel__title">{currentSlide.headline}</h1>
              <p className="home-carousel__copy">{currentSlide.copy}</p>
              <div className="home-carousel__actions">
                <Link href={currentSlide.href} className="primary-button">
                  {currentSlide.cta}
                </Link>
                <Link href="/new-arrivals" className="secondary-button">
                  {STOREFRONT_STRINGS.home.heroPrimaryCta}
                </Link>
              </div>
            </div>
            {heroSlides.length > 1 ? (
              <div className="home-carousel__dots" aria-label="Featured collections">
                {heroSlides.map((slide, index) => (
                  <button
                    key={slide.key}
                    type="button"
                    className={`home-carousel__dot${index === activeSlide ? " is-active" : ""}`}
                    aria-label={`Show ${slide.label}`}
                    onClick={() => setActiveSlide(index)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {topCategoryTiles.length ? (
          <div className="home-quick-rail" aria-label="Shop categories">
            {topCategoryTiles.map((tile) => (
              <Link key={`${tile.key}-${tile.href}`} href={tile.href} className="home-quick-tile">
                {tile.imageUrl ? (
                  <img src={tile.imageUrl} alt={tile.label} className="home-quick-tile__image" />
                ) : (
                  <div className="home-quick-tile__image home-quick-tile__image--empty">{tile.label}</div>
                )}
                <div className="home-quick-tile__overlay">
                  <span className="home-quick-tile__badge">{tile.badge}</span>
                  <strong>{tile.label}</strong>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {state.loading ? <div className="section-copy" style={{ marginTop: 20 }}>{STOREFRONT_STRINGS.home.loading}</div> : null}
      {state.technicalError ? <div className="status-banner status-banner--error" style={{ marginTop: 20 }}>{state.technicalError}</div> : null}

      {state.newArrivals.length ? (
        <section className="section section--early">
          <div className="section-header">
            <div>
              <div className="section-kicker">Fresh Picks</div>
              <h2 className="section-title">{STOREFRONT_STRINGS.home.newArrivalsTitle}</h2>
            </div>
            <Link href="/new-arrivals" className="secondary-button">
              {STOREFRONT_STRINGS.home.viewAll}
            </Link>
          </div>
          <div className="home-fresh-grid">
            {state.newArrivals.slice(0, 4).map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        </section>
      ) : null}

      {categoryTiles.length ? (
        <section className="section section--compact" id="collections">
          <div className="section-header">
            <div>
              <div className="section-kicker">{STOREFRONT_STRINGS.home.collectionTilesKicker}</div>
              <h2 className="section-title">{STOREFRONT_STRINGS.home.collectionTilesTitle}</h2>
            </div>
          </div>
          <div className="home-category-grid">
            {categoryTiles.map((collection) => (
              <Link key={`${collection.href}-${collection.label}`} href={collection.href} className="home-category-card">
                {collection.imageUrl ? (
                  <img src={collection.imageUrl} alt={collection.label} className="home-category-card__image" />
                ) : (
                  <div className="home-category-card__image home-category-card__image--empty">{collection.label}</div>
                )}
                <div className="home-category-card__body">
                  <span className="home-category-card__badge">{collection.badge}</span>
                  <strong>{collection.label}</strong>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {state.newArrivals.length > 4 ? (
        <section className="section">
          <div className="section-header">
            <div>
              <div className="section-kicker">{STOREFRONT_STRINGS.home.newArrivals}</div>
              <h2 className="section-title">{STOREFRONT_STRINGS.home.newArrivalsTitle}</h2>
            </div>
            <Link href="/new-arrivals" className="secondary-button">
              {STOREFRONT_STRINGS.home.viewAll}
            </Link>
          </div>
          <div className="card-grid">
            {state.newArrivals.map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        </section>
      ) : null}

      {featuredSareeProducts.length ? (
        <section className="section" id="featured-sarees">
          <div className="section-header">
            <div>
              <div className="section-kicker">{STOREFRONT_STRINGS.home.featuredEditKicker}</div>
              <h2 className="section-title">{state.featuredSarees?.label || STOREFRONT_STRINGS.home.featuredEditTitle}</h2>
            </div>
            {state.featuredSarees ? (
              <Link href={state.featuredSarees.href} className="secondary-button">
                {STOREFRONT_STRINGS.home.shopCollection(state.featuredSarees.label)}
              </Link>
            ) : null}
          </div>
          <div className="card-grid">
            {featuredSareeProducts.map((product) => <ProductCard key={product._id} product={product} />)}
          </div>
        </section>
      ) : null}

      {state.accessoryCollections.length ? (
        <section className="section">
          <div className="section-header">
            <div>
              <div className="section-kicker">{STOREFRONT_STRINGS.home.styleEditKicker}</div>
              <h2 className="section-title">{STOREFRONT_STRINGS.home.styleEditTitle}</h2>
            </div>
          </div>
          <div className="home-style-grid">
            {state.accessoryCollections.map((collection) => (
              <Link key={`${collection.href}-${collection.label}`} href={collection.href} className="home-style-card">
                {collection.imageUrl ? (
                  <img src={collection.imageUrl} alt={collection.label} className="home-style-card__image" />
                ) : (
                  <div className="home-style-card__image home-style-card__image--empty">{collection.label}</div>
                )}
                <div className="home-style-card__body">
                  <span className="section-kicker">{collection.badge}</span>
                  <strong>{collection.label}</strong>
                  <p>{collection.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {state.saleCollection ? (
        <section className="section">
          <Link href={state.saleCollection.href} className="offer-banner">
            <div className="offer-banner__content">
              <div className="section-kicker">{STOREFRONT_STRINGS.home.saleKicker}</div>
              <h2 className="section-title offer-banner__title">{state.saleCollection.label || STOREFRONT_STRINGS.home.saleTitle}</h2>
              <p className="section-copy">{STOREFRONT_STRINGS.home.saleCopy}</p>
              <span className="offer-banner__cta">{STOREFRONT_STRINGS.home.shopCollection(state.saleCollection.label)}</span>
            </div>
            <div className="offer-banner__media">
              {state.saleCollection.products.slice(0, 2).map((product) => (
                <div key={product._id} className="offer-banner__thumb">
                  {product.defaultVariant?.imageUrl ? (
                    <img src={product.defaultVariant.imageUrl} alt={product.title} />
                  ) : (
                    <div className="offer-banner__thumb offer-banner__thumb--empty">{product.title}</div>
                  )}
                </div>
              ))}
            </div>
          </Link>
        </section>
      ) : null}

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
