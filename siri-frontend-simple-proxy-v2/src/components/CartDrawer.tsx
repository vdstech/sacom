"use client";

import Link from "next/link";
import { useStoreCart } from "@/components/StoreProvider";

export function CartDrawer() {
  const { cart, error, loading, open, setOpen, updateItem, removeItem } = useStoreCart();

  return (
    <>
      <div className={`cart-backdrop ${open ? "is-open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`cart-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="cart-drawer__header">
          <div>
            <div className="cart-drawer__eyebrow">Shopping Bag</div>
            <h2>Cart</h2>
          </div>
          <button type="button" className="cart-close" onClick={() => setOpen(false)}>Close</button>
        </div>

        {loading ? <div className="cart-empty">Loading cart…</div> : null}
        {!loading && error ? <div className="status-banner status-banner--error">{error}</div> : null}
        {!loading && !cart?.items?.length ? <div className="cart-empty">Your cart is empty.</div> : null}

        {!!cart?.warnings?.length && (
          <div className="cart-warnings">
            {cart.warnings.map((warning, index) => (
              <div key={`${warning.itemId || "warning"}-${index}`}>{warning.message}</div>
            ))}
          </div>
        )}

        <div className="cart-lines">
          {(cart?.items || []).map((item) => (
            <div key={item.itemId} className="cart-line">
              {item.imageUrl ? <img src={item.imageUrl} alt={item.productTitle} className="cart-line__image" /> : null}
              <div className="cart-line__content">
                <Link href={`/products/${item.productSlug}`} className="cart-line__title" onClick={() => setOpen(false)}>
                  {item.productTitle}
                </Link>
                <div className="cart-line__meta">
                  {item.colorName || "Variant"}{item.sizeLabel ? ` / ${item.sizeLabel}` : ""}
                </div>
                <div className="cart-line__price">₹{Number(item.effectivePrice || 0)}</div>
                <div className="cart-line__actions">
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
                  <button type="button" className="cart-remove" onClick={() => removeItem(item.itemId)}>
                    Remove
                  </button>
                </div>
                {!item.available ? <div className="cart-line__warning">Currently unavailable</div> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="cart-drawer__footer">
          <div className="cart-drawer__summary">
            <span>Subtotal</span>
            <strong>₹{Number(cart?.subtotal || 0)}</strong>
          </div>
          <div className="cart-drawer__note">
            Cart stays available across browser restarts and is ready to merge with future sign-in.
          </div>
          <Link href="/checkout" className="checkout-button" onClick={() => setOpen(false)}>
            Checkout
          </Link>
        </div>
      </aside>
    </>
  );
}
