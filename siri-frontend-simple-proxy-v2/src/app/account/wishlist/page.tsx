"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/AccountShell";
import { ProductCard } from "@/components/ProductCard";
import { useAccount } from "@/components/AccountProvider";
import { fetchCustomerWishlist, removeCustomerWishlistItem, type CustomerWishlistItem } from "@/lib/accountApi";
import { STOREFRONT_STRINGS } from "@/lib/strings";

export default function WishlistPage() {
  const router = useRouter();
  const { ready, customer, accessToken } = useAccount();
  const [items, setItems] = useState<CustomerWishlistItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!customer || !accessToken) {
      router.replace(`/account/auth?returnTo=${encodeURIComponent("/account/wishlist")}`);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const payload = await fetchCustomerWishlist(accessToken);
        if (!cancelled) setItems(payload.items || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.wishlist.fallbackError);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ready, customer, accessToken, router]);

  const removeItem = async (productId: string) => {
    if (!accessToken) return;
    await removeCustomerWishlistItem(accessToken, productId);
    setItems((current) => current.filter((item) => item._id !== productId));
  };

  return (
    <AccountShell title={STOREFRONT_STRINGS.account.wishlist.title} subtitle={STOREFRONT_STRINGS.account.wishlist.subtitle}>
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}
      {!items.length ? (
        <div className="coming-soon">
          <h2 className="coming-soon__title">{STOREFRONT_STRINGS.account.wishlist.emptyTitle}</h2>
          <p className="coming-soon__copy">{STOREFRONT_STRINGS.account.wishlist.emptyCopy}</p>
        </div>
      ) : (
        <div className="account-wishlist">
          <div className="card-grid">
            {items.map((item) => (
              <div key={item._id} className="account-wishlist__item">
                <ProductCard product={item} />
                <button type="button" className="secondary-button account-wishlist__remove" onClick={() => removeItem(item._id)}>
                  {STOREFRONT_STRINGS.account.wishlist.remove}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </AccountShell>
  );
}
