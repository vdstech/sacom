"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";
import { ProductCard } from "@/components/ProductCard";
import { useStoreCart } from "@/components/StoreProvider";
import { addCustomerWishlistItem } from "@/lib/accountApi";
import { formatMoney, getPriceDisplay } from "@/lib/pricing";
import { rememberProduct, getRecentlyViewed } from "@/lib/recentlyViewed";
import { fetchCategoryTree, fetchStore, type ProductDetail, type ProductListItem, type ProductVariant } from "@/lib/storeApi";
import {
  findCategoryNodeBySlug,
  isLiveCategorySlug,
  isNotFoundError,
  normalizeCategorySlug,
  toTechnicalBannerMessage,
} from "@/lib/storefront";

const TABS = ["description", "dry-clean", "shipping", "returns"] as const;

function formatVariantMeta(variant: ProductVariant) {
  return (variant.colors || []).map((entry) => entry?.name).filter(Boolean).join(", ") || "Variant";
}

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = String(params?.slug || "");
  const { addItem } = useStoreCart();
  const { customer, accessToken } = useAccount();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [featured, setFeatured] = useState<ProductListItem[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<ProductListItem[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedStockKey, setSelectedStockKey] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("description");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [technicalError, setTechnicalError] = useState("");
  const [wishlistMessage, setWishlistMessage] = useState("");
  const [categoryHref, setCategoryHref] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setNotFound(false);
        setTechnicalError("");

        const payload = await fetchStore<ProductDetail>(`/products/${encodeURIComponent(slug)}`);
        if (cancelled) return;

        setProduct(payload);
        setFeatured([]);
        setCategoryHref("");

        const initialVariantId = payload.defaultVariant?.variantId || payload.variants?.[0]?._id || "";
        setSelectedVariantId(initialVariantId);

        const initialVariant = (payload.variants || []).find((variant) => variant._id === initialVariantId) || payload.variants?.[0];
        const initialStock = (initialVariant?.stock || []).find((row) => Number(row.quantity || 0) > 0) || initialVariant?.stock?.[0];
        setSelectedStockKey(String(initialStock?.stockKey || ""));
        setQuantity(1);
        setActiveImageIndex(0);

        rememberProduct(payload);
        const recentEntries = getRecentlyViewed(payload.categorySlug, payload._id);
        setRecentlyViewed(
          recentEntries.map((entry) => ({
            _id: entry.productId,
            slug: entry.slug,
            title: entry.title,
            categorySlug: entry.categorySlug,
            shortDescription: "Recently viewed",
            defaultVariant: {
              imageUrl: entry.imageUrl,
              price: entry.price,
              effectivePrice: entry.effectivePrice,
              discount: entry.discount,
            },
          }))
        );

        if (payload.categorySlug) {
          const categoryTreeResult = await Promise.allSettled([fetchCategoryTree()]);
          if (cancelled) return;
          const [categoryTree] = categoryTreeResult;
          if (categoryTree.status === "fulfilled") {
            const matchedCategory = findCategoryNodeBySlug(categoryTree.value, payload.categorySlug);
            if (matchedCategory?.path) {
              setCategoryHref(`/c/${String(matchedCategory.path).replace(/^\/+|\/+$/g, "")}`);
            } else {
              setCategoryHref(`/c/${payload.categorySlug}`);
            }
          } else {
            setCategoryHref(`/c/${payload.categorySlug}`);
          }
        }

        if (isLiveCategorySlug(payload.categorySlug)) {
          const featuredResult = await Promise.allSettled([
            fetchStore<ProductListItem[]>(
              `/products?featured=true&categorySlug=${encodeURIComponent(normalizeCategorySlug(payload.categorySlug))}&limit=4`
            ),
          ]);
          if (cancelled) return;

          const [featuredRail] = featuredResult;
          setFeatured(
            featuredRail.status === "fulfilled"
              ? (featuredRail.value || []).filter((item) => item.slug !== payload.slug)
              : []
          );
          if (featuredRail.status === "rejected") {
            setTechnicalError(toTechnicalBannerMessage(featuredRail.reason));
          }
        }
      } catch (error) {
        if (cancelled) return;
        setProduct(null);
        setFeatured([]);
        setCategoryHref("");
        setActiveImageIndex(0);
        if (isNotFoundError(error)) {
          setNotFound(true);
          setTechnicalError("");
        } else {
          setTechnicalError(toTechnicalBannerMessage(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const selectedVariant = useMemo(
    () => (product?.variants || []).find((variant) => variant._id === selectedVariantId) || product?.variants?.[0] || null,
    [product, selectedVariantId]
  );

  const selectedStock = useMemo(
    () => (selectedVariant?.stock || []).find((row) => String(row.stockKey || "") === selectedStockKey) || null,
    [selectedVariant, selectedStockKey]
  );

  useEffect(() => {
    const inVariant = (selectedVariant?.stock || []).find((row) => Number(row.quantity || 0) > 0) || selectedVariant?.stock?.[0];
    setSelectedStockKey(String(inVariant?.stockKey || ""));
    setQuantity(1);
    setActiveImageIndex(0);
  }, [selectedVariantId]);

  const handleAddToCart = async () => {
    if (!product?._id || !selectedVariant?._id || !selectedStock?.stockKey) return;
    await addItem({
      productId: product._id,
      variantId: selectedVariant._id,
      stockKey: selectedStock.stockKey,
      quantity,
    });
  };

  const handleAddToWishlist = async () => {
    if (!product?._id) return;
    if (!customer || !accessToken) {
      router.push(`/account/auth?returnTo=${encodeURIComponent(`/products/${product.slug}`)}`);
      return;
    }
    try {
      await addCustomerWishlistItem(accessToken, product._id);
      setWishlistMessage("Saved to wishlist");
    } catch (err) {
      setWishlistMessage(err instanceof Error ? err.message : "Unable to save wishlist item");
    }
  };

  const tabContent = useMemo(() => {
    if (!product) return "";
    if (activeTab === "description") return product.description || product.shortDescription || "Description coming soon.";
    if (activeTab === "dry-clean") return product.care?.text || "Dry clean guidance will be added shortly.";
    if (activeTab === "shipping") return product.shipping?.text || "Shipping details coming soon.";
    return `${product.returnPolicy?.text || "Return and exchange details coming soon."}\n\nReturnable: ${product.returnPolicy?.returnable ? "Yes" : "No"}\nEligible Days: ${Number(product.returnPolicy?.windowDays || 0)}`;
  }, [activeTab, product]);

  const galleryImages = selectedVariant?.images?.length
    ? selectedVariant.images
    : (selectedVariant?.images?.[0]?.url ? [{ url: selectedVariant.images[0].url }] : []);
  const activeImage = galleryImages[activeImageIndex] || galleryImages[0] || null;
  const price = getPriceDisplay(selectedVariant);

  return (
    <section className="section">
      {loading ? <div className="section-copy">Loading product…</div> : null}
      {technicalError ? <div className="status-banner status-banner--error">{technicalError}</div> : null}
      {!loading && notFound ? <div className="section-copy">Product not found.</div> : null}

      {product ? (
        <>
          <article className="product-detail">
            <div className="product-gallery">
              <div className="product-gallery__main">
                {price.hasDiscount ? (
                  <span className="store-discount-badge product-gallery__discount-badge">{price.percentOff}% OFF</span>
                ) : null}
                {activeImage?.url ? (
                  <img
                    src={activeImage.url}
                    alt={activeImage.alt || `${product.title} image ${activeImageIndex + 1}`}
                  />
                ) : (
                  <div className="product-gallery__placeholder" />
                )}
              </div>
              <div className="product-gallery__thumbs">
                {galleryImages.length ? galleryImages.map((image, index) => (
                  <button
                    key={`${image?.url || "image"}-${index}`}
                    type="button"
                    className={`product-gallery__thumb ${activeImageIndex === index ? "is-active" : ""}`}
                    onClick={() => setActiveImageIndex(index)}
                    aria-pressed={activeImageIndex === index}
                    aria-label={`Show ${product.title} image ${index + 1}`}
                  >
                    {image?.url ? (
                      <img
                        src={image.url}
                        alt={image.alt || `${product.title} thumbnail ${index + 1}`}
                      />
                    ) : (
                      <div className="product-gallery__placeholder" />
                    )}
                  </button>
                )) : (
                  <div className="product-gallery__thumb">
                    <div className="product-gallery__placeholder" />
                  </div>
                )}
              </div>
            </div>

            <div className="product-info">
              <div className="section-kicker">{product.categorySlug || "Collection"}</div>
              <h1 className="product-detail__title">{product.title}</h1>
              <div className="product-detail__copy">{product.description || product.shortDescription}</div>
              <div className="product-price">
                <div className="product-price__amounts">
                  <strong>{formatMoney(price.finalPrice)}</strong>
                  {price.hasDiscount ? (
                    <div className="product-price__meta">
                      <span className="product-price__original">{formatMoney(price.originalPrice)}</span>
                      <span className="product-price__discount">{price.percentOff}% OFF</span>
                    </div>
                  ) : null}
                </div>
                <span className="section-copy">{selectedVariant?.availability ? "In stock" : "Made visible for future launch"}</span>
              </div>

              <div>
                <div className="section-kicker">Select Variant</div>
                <div className="variant-pills">
                  {(product.variants || []).map((variant) => (
                    <button
                      type="button"
                      key={variant._id}
                      className={`filter-chip ${selectedVariantId === variant._id ? "is-active" : ""}`}
                      onClick={() => setSelectedVariantId(variant._id)}
                    >
                      {formatVariantMeta(variant)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-kicker">Select Size</div>
                <div className="size-grid">
                  {(selectedVariant?.stock || []).map((row) => {
                    const disabled = Number(row.quantity || 0) <= 0;
                    return (
                      <button
                        key={row.stockKey || row.sizeLabel}
                        type="button"
                        className={`size-button ${selectedStockKey === row.stockKey ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}
                        onClick={() => !disabled && setSelectedStockKey(String(row.stockKey || ""))}
                        disabled={disabled}
                      >
                        {row.sizeLabel || "Size"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pdp-actions">
                <div className="qty-stepper">
                  <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>-</button>
                  <span>{quantity}</span>
                  <button
                    type="button"
                    disabled={!selectedStock || quantity >= Number(selectedStock.quantity || 0)}
                    onClick={() => setQuantity((current) => current + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!selectedStock || Number(selectedStock.quantity || 0) <= 0}
                  onClick={handleAddToCart}
                >
                  Add to Cart
                </button>
                <button type="button" className="secondary-button" onClick={handleAddToWishlist}>
                  Save to Wishlist
                </button>
              </div>
              {wishlistMessage ? <div className="section-copy">{wishlistMessage}</div> : null}

              <div className="tab-list">
                <button type="button" className={`tab-button ${activeTab === "description" ? "is-active" : ""}`} onClick={() => setActiveTab("description")}>Description</button>
                <button type="button" className={`tab-button ${activeTab === "dry-clean" ? "is-active" : ""}`} onClick={() => setActiveTab("dry-clean")}>Dry Clean</button>
                <button type="button" className={`tab-button ${activeTab === "shipping" ? "is-active" : ""}`} onClick={() => setActiveTab("shipping")}>Shipping</button>
                <button type="button" className={`tab-button ${activeTab === "returns" ? "is-active" : ""}`} onClick={() => setActiveTab("returns")}>Return &amp; Exchange</button>
              </div>
              <div className="tab-panel">{tabContent}</div>
            </div>
          </article>

          <section className="section">
            <div className="section-header">
              <div>
                <div className="section-kicker">Recently Viewed</div>
                <h2 className="section-title">Same Category Inspiration</h2>
              </div>
            </div>
            {recentlyViewed.length ? (
              <div className="card-grid">
                {recentlyViewed.map((item) => <ProductCard key={item._id} product={item} />)}
              </div>
            ) : (
              <div className="coming-soon">
                <h3 className="coming-soon__title">Start browsing this category to build your recently viewed rail.</h3>
              </div>
            )}
          </section>

          {featured.length ? (
            <section className="section">
              <div className="section-header">
                <div>
                  <div className="section-kicker">Featured Picks</div>
                  <h2 className="section-title">You May Also Like</h2>
                </div>
              </div>
              <div className="card-grid">
                {featured.map((item) => <ProductCard key={item._id} product={item} />)}
              </div>
            </section>
          ) : null}

          {product.categorySlug ? (
            <div className="section">
              <Link href={categoryHref || `/c/${product.categorySlug}`} className="secondary-button">Back to {product.categorySlug}</Link>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
