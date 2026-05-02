"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/AccountShell";
import { useAccount } from "@/components/AccountProvider";
import { fetchCustomerCoupons, type CustomerCoupon } from "@/lib/accountApi";
import { formatMoney } from "@/lib/pricing";
import { STOREFRONT_STRINGS } from "@/lib/strings";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function CouponsPage() {
  const router = useRouter();
  const { ready, customer, accessToken } = useAccount();
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!customer || !accessToken) {
      router.replace(`/account/auth?returnTo=${encodeURIComponent("/account/coupons")}`);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const payload = await fetchCustomerCoupons(accessToken);
        if (!cancelled) setCoupons(payload.coupons || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.coupons.fallbackError);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ready, customer, accessToken, router]);

  return (
    <AccountShell title={STOREFRONT_STRINGS.account.coupons.title} subtitle={STOREFRONT_STRINGS.account.coupons.subtitle}>
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}
      <div className="account-addresses__list">
        {coupons.length ? coupons.map((coupon) => (
          <div key={coupon.id} className="account-addresses__item">
            <div className="account-addresses__item-head">
              <strong>{coupon.code}</strong>
              <span className="category-card__badge">{coupon.status}</span>
            </div>
            <p className="section-copy">
              {STOREFRONT_STRINGS.account.coupons.value}: {formatMoney(Number(coupon.valueAmount || 0))}
              <br />
              {STOREFRONT_STRINGS.account.coupons.validity}: {formatDate(coupon.validFrom)} - {formatDate(coupon.validUntil)}
              <br />
              {STOREFRONT_STRINGS.account.coupons.usedAt}: {formatDate(coupon.usedAt)}
            </p>
          </div>
        )) : (
          <div className="coming-soon">
            <h2 className="coming-soon__title">{STOREFRONT_STRINGS.account.coupons.emptyTitle}</h2>
            <p className="coming-soon__copy">{STOREFRONT_STRINGS.account.coupons.emptyCopy}</p>
          </div>
        )}
      </div>
    </AccountShell>
  );
}
