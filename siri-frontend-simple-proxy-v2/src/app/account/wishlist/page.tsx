"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/AccountShell";
import { ProductCard } from "@/components/ProductCard";
import { useAccount } from "@/components/AccountProvider";
import { fetchCustomerWishlist, removeCustomerWishlistItem, type CustomerWishlistItem } from "@/lib/accountApi";

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
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load wishlist");
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
    <AccountShell title="Wishlist" subtitle="Saved products stay ready here while you browse the catalog.">
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}
      {!items.length ? (
        <div className="coming-soon">
          <h2 className="coming-soon__title">Your wishlist is empty.</h2>
          <p className="coming-soon__copy">Add products from the product detail page to keep them here.</p>
        </div>
      ) : (
        <div className="account-wishlist">
          <div className="card-grid">
            {items.map((item) => (
              <div key={item._id} className="account-wishlist__item">
                <ProductCard product={item} />
                <button type="button" className="secondary-button account-wishlist__remove" onClick={() => removeItem(item._id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </AccountShell>
  );
}
