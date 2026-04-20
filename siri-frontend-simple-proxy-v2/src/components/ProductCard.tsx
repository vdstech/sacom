"use client";

import Link from "next/link";
import { ProductListItem } from "@/lib/storeApi";
import { formatMoney, getPriceDisplay } from "@/lib/pricing";

export function ProductCard({ product }: { product: ProductListItem }) {
  const price = getPriceDisplay(product.defaultVariant);

  return (
    <article className="store-card">
      <Link href={`/products/${product.slug}`} className="product-card__image-wrap">
        {price.hasDiscount ? (
          <span className="store-discount-badge product-card__discount-badge">{price.percentOff}% OFF</span>
        ) : null}
        {product.defaultVariant?.imageUrl ? (
          <img
            src={product.defaultVariant.imageUrl}
            alt={product.title}
            className="product-card__image"
          />
        ) : (
          <div className="product-card__image product-card__image--empty">Coming Soon</div>
        )}
        <div className="product-card__thumbs" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </Link>
      <div className="product-card__body">
        <div className="product-card__eyebrow">{product.categorySlug || "Siri Collections"}</div>
        <Link href={`/products/${product.slug}`} className="product-card__title">
          {product.title}
        </Link>
        <div className="product-card__copy">{product.shortDescription || "Curated collection"}</div>
        <div className="product-card__footer">
          <div className="product-card__price">
            <strong>{formatMoney(price.finalPrice)}</strong>
            {price.hasDiscount ? (
              <div className="product-card__price-meta">
                <span className="product-card__original-price">{formatMoney(price.originalPrice)}</span>
                <span className="product-card__discount">{price.percentOff}% OFF</span>
              </div>
            ) : null}
          </div>
          <Link href={`/products/${product.slug}`} className="product-card__link">
            View Details
          </Link>
        </div>
      </div>
    </article>
  );
}
