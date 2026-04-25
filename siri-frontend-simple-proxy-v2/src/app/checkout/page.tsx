"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";
import { useStoreCart } from "@/components/StoreProvider";
import { formatMoney } from "@/lib/pricing";
import { STOREFRONT_STRINGS } from "@/lib/strings";

export default function CheckoutPage() {
  const router = useRouter();
  const { ready, customer, saveWishlistProduct } = useAccount();
  const { cart, loading, error, updateItem, removeItem } = useStoreCart();
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "error">("neutral");
  const [pendingItemId, setPendingItemId] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!customer) {
      router.replace(`/account/auth?returnTo=${encodeURIComponent("/checkout")}`);
    }
  }, [ready, customer, router]);

  const moveToWishlist = async (item: NonNullable<typeof cart>["items"][number]) => {
    if (!item?.itemId || !item?.productId || pendingItemId) return;

    setPendingItemId(item.itemId);
    setStatusMessage("");
    try {
      const result = await saveWishlistProduct(item.productId, "/checkout");
      if (result === "redirected") return;
      const removed = await removeItem(item.itemId);
      if (!removed) throw new Error(STOREFRONT_STRINGS.navigation.cart.unavailable);
      setStatusMessage(STOREFRONT_STRINGS.checkout.movedToWishlist);
      setStatusTone("neutral");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : STOREFRONT_STRINGS.checkout.moveToWishlistFailed);
      setStatusTone("error");
    } finally {
      setPendingItemId("");
    }
  };

  const isEmpty = !loading && !(cart?.items || []).length;

  return (
    <section className="section">
      <div className="checkout-shell">
        <div>
          <div className="section-kicker">{STOREFRONT_STRINGS.checkout.title}</div>
          <h1 className="section-title">{STOREFRONT_STRINGS.checkout.title}</h1>
          <p className="section-copy">{STOREFRONT_STRINGS.checkout.subtitle}</p>
        </div>

        {error ? <div className="status-banner status-banner--error">{error}</div> : null}
        {statusMessage ? <div className={`status-banner ${statusTone === "error" ? "status-banner--error" : ""}`}>{statusMessage}</div> : null}

        {loading ? <div className="section-copy">{STOREFRONT_STRINGS.product.loading}</div> : null}

        {isEmpty ? (
          <div className="coming-soon">
            <h2 className="coming-soon__title">{STOREFRONT_STRINGS.checkout.emptyTitle}</h2>
            <p className="coming-soon__copy">{STOREFRONT_STRINGS.checkout.emptyCopy}</p>
            <Link href="/" className="secondary-button">{STOREFRONT_STRINGS.checkout.keepShopping}</Link>
          </div>
        ) : null}

        {!loading && !isEmpty ? (
          <div className="checkout-layout">
            <div className="checkout-lines">
              {(cart?.items || []).map((item) => (
                <div key={item.itemId} className="checkout-line">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.productTitle} className="checkout-line__image" /> : null}
                  <div className="checkout-line__content">
                    <Link href={`/products/${item.productSlug}`} className="checkout-line__title">
                      {item.productTitle}
                    </Link>
                    <div className="checkout-line__meta">
                      {item.colorName || STOREFRONT_STRINGS.product.variantFallback}
                      {item.sizeLabel ? ` / ${item.sizeLabel}` : ""}
                    </div>
                    <div className="checkout-line__price">{formatMoney(Number(item.effectivePrice || 0))}</div>
                    <div className="checkout-line__actions">
                      <div className="qty-stepper">
                        <button type="button" onClick={() => updateItem(item.itemId, Math.max(0, item.quantity - 1))}>-</button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          disabled={!item.available}
                          onClick={() => updateItem(item.itemId, item.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                      <button type="button" className="secondary-button" onClick={() => removeItem(item.itemId)}>
                        Remove
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={pendingItemId === item.itemId}
                        onClick={() => moveToWishlist(item)}
                      >
                        {pendingItemId === item.itemId ? "..." : STOREFRONT_STRINGS.checkout.moveToWishlist}
                      </button>
                    </div>
                    {!item.available ? <div className="checkout-line__warning">{STOREFRONT_STRINGS.checkout.stockChanged}</div> : null}
                  </div>
                </div>
              ))}
            </div>

            <aside className="checkout-summary">
              <div className="section-kicker">{STOREFRONT_STRINGS.checkout.summaryTitle}</div>
              <div className="checkout-summary__row">
                <span>Items</span>
                <strong>{cart?.itemCount || 0}</strong>
              </div>
              <div className="checkout-summary__row">
                <span>Subtotal</span>
                <strong>{formatMoney(Number(cart?.subtotal || 0))}</strong>
              </div>
              <Link href="/checkout/confirmation" className="checkout-button">
                {STOREFRONT_STRINGS.checkout.continueToConfirmation}
              </Link>
            </aside>
          </div>
        ) : null}
      </div>
    </section>
  );
}
