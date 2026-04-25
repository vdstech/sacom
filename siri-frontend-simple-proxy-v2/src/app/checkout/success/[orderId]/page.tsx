"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";
import { fetchCustomerOrder, type CustomerOrder } from "@/lib/accountApi";
import { formatMoney } from "@/lib/pricing";
import { STOREFRONT_STRINGS } from "@/lib/strings";

function getPaymentStatusLabel(status?: string) {
  if (!status) return STOREFRONT_STRINGS.account.orders.paymentStates.paid;
  return STOREFRONT_STRINGS.account.orders.paymentStates[
    status as keyof typeof STOREFRONT_STRINGS.account.orders.paymentStates
  ] || status;
}

export default function CheckoutSuccessPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const { ready, customer, accessToken } = useAccount();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!customer || !accessToken) {
      router.replace(`/account/auth?returnTo=${encodeURIComponent(`/checkout/success/${params?.orderId || ""}`)}`);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const payload = await fetchCustomerOrder(accessToken, String(params?.orderId || ""));
        if (!cancelled) setOrder(payload.order);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.orders.fallbackError);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ready, customer, accessToken, router, params?.orderId]);

  return (
    <section className="section">
      <div className="checkout-shell">
        {error ? <div className="status-banner status-banner--error">{error}</div> : null}
        {!order && !error ? <div className="section-copy">{STOREFRONT_STRINGS.product.loading}</div> : null}
        {order ? (
          <div className="checkout-success">
            <div className="section-kicker">
              {order.paymentStatus === "payment_failed"
                ? STOREFRONT_STRINGS.checkout.failureTitle
                : STOREFRONT_STRINGS.checkout.successTitle}
            </div>
            <h1 className="section-title">
              {order.paymentStatus === "payment_failed"
                ? STOREFRONT_STRINGS.checkout.failureTitle
                : STOREFRONT_STRINGS.checkout.successTitle}
            </h1>
            <p className="section-copy">
              {order.paymentStatus === "payment_failed"
                ? STOREFRONT_STRINGS.checkout.failureSubtitle
                : STOREFRONT_STRINGS.checkout.successSubtitle}
            </p>

            <div className="checkout-success__grid">
              <div className="checkout-summary">
                <div className="checkout-summary__row">
                  <span>{STOREFRONT_STRINGS.checkout.successOrder}</span>
                  <strong>{order.id.slice(-6).toUpperCase()}</strong>
                </div>
                <div className="checkout-summary__row">
                  <span>{STOREFRONT_STRINGS.checkout.successAmount}</span>
                  <strong>{formatMoney(Number(order.grandTotal ?? order.total ?? 0))}</strong>
                </div>
                <div className="checkout-summary__row">
                  <span>{STOREFRONT_STRINGS.account.orders.paymentStatus}</span>
                  <strong>{getPaymentStatusLabel(order.paymentStatus)}</strong>
                </div>
                <div className="checkout-summary__row">
                  <span>{STOREFRONT_STRINGS.account.orders.fulfillmentStatus}</span>
                  <strong>{order.fulfillmentStatus || "pending"}</strong>
                </div>
              </div>

              <div className="checkout-summary">
                <div className="section-kicker">{STOREFRONT_STRINGS.checkout.successAddress}</div>
                <div className="section-copy">
                  {order.addressSnapshot?.fullName}
                  <br />
                  {order.addressSnapshot?.line1}
                  {order.addressSnapshot?.line2 ? `, ${order.addressSnapshot.line2}` : ""}
                  <br />
                  {order.addressSnapshot?.city}, {order.addressSnapshot?.state} {order.addressSnapshot?.postalCode}
                  <br />
                  {order.addressSnapshot?.country}
                  <br />
                  {order.addressSnapshot?.phone}
                </div>
              </div>
            </div>

            <div className="checkout-summary">
              <div className="section-kicker">{STOREFRONT_STRINGS.checkout.successItems}</div>
              <div className="checkout-lines checkout-lines--summary">
                {order.items.map((item, index) => (
                  <div key={`${item.slug || item.title}-${index}`} className="checkout-summary__line">
                    <span>{item.title} x {item.quantity}</span>
                    <strong>{formatMoney(Number(item.lineGrandTotal ?? item.lineTotal ?? 0))}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="checkout-success__actions">
              <Link href="/account/orders" className="primary-button">{STOREFRONT_STRINGS.checkout.viewOrders}</Link>
              <Link href="/" className="secondary-button">{STOREFRONT_STRINGS.checkout.keepShopping}</Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
