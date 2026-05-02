"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";
import { useStoreCart } from "@/components/StoreProvider";
import {
  abandonCheckoutSession,
  applyCheckoutCoupon,
  createCustomerAddress,
  createCheckoutSession,
  confirmCheckoutSession,
  fetchCheckoutSession,
  fetchCustomerAddresses,
  removeCheckoutCoupon,
  type CustomerCheckoutSession,
  type CustomerAddress,
} from "@/lib/accountApi";
import { formatMoney } from "@/lib/pricing";
import { STOREFRONT_STRINGS } from "@/lib/strings";

const EMPTY_FORM = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  isDefault: false,
};

const ADDRESS_FIELDS = [
  ["fullName", STOREFRONT_STRINGS.account.addresses.fields.fullName],
  ["phone", STOREFRONT_STRINGS.account.addresses.fields.phone],
  ["line1", STOREFRONT_STRINGS.account.addresses.fields.line1],
  ["line2", STOREFRONT_STRINGS.account.addresses.fields.line2],
  ["city", STOREFRONT_STRINGS.account.addresses.fields.city],
  ["state", STOREFRONT_STRINGS.account.addresses.fields.state],
  ["postalCode", STOREFRONT_STRINGS.account.addresses.fields.postalCode],
  ["country", STOREFRONT_STRINGS.account.addresses.fields.country],
] as const;

export default function CheckoutConfirmationPage() {
  const router = useRouter();
  const { ready, customer, loading: accountLoading, accessToken } = useAccount();
  const { cart, loading: cartLoading, error: cartError, refreshCart, setOpen } = useStoreCart();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "error">("neutral");
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [savingAddress, setSavingAddress] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [checkoutSession, setCheckoutSession] = useState<CustomerCheckoutSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const completedSessionRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!customer || !accessToken) {
      router.replace(`/account/auth?returnTo=${encodeURIComponent("/checkout/confirmation")}`);
      return;
    }

    let cancelled = false;
    async function loadAddresses() {
      setLoadingAddresses(true);
      try {
        const payload = await fetchCustomerAddresses(accessToken);
        if (cancelled) return;
        const nextAddresses = payload.addresses || [];
        setAddresses(nextAddresses);
        const preferredAddress = nextAddresses.find((entry) => entry.isDefault) || nextAddresses[0] || null;
        setSelectedAddressId(preferredAddress?.id || "");
      } catch (err) {
        if (!cancelled) {
          setStatusMessage(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.addresses.fallbackError);
          setStatusTone("error");
        }
      } finally {
        if (!cancelled) setLoadingAddresses(false);
      }
    }
    loadAddresses();
    return () => {
      cancelled = true;
    };
  }, [ready, customer, accessToken, router]);

  const hasCartItems = !!(cart?.items || []).length;
  const authPending = !ready || accountLoading;
  const isRedirectingToAuth = ready && !customer;
  const payLabel = useMemo(
    () => STOREFRONT_STRINGS.checkout.payButton(formatMoney(Number(checkoutSession?.payableAmount ?? cart?.subtotal ?? 0))),
    [checkoutSession?.payableAmount, cart?.subtotal]
  );

  useEffect(() => {
    if (!ready || !customer || !accessToken || !cart?.cartToken || !hasCartItems) {
      setCheckoutSession(null);
      setLoadingSession(false);
      return;
    }

    let cancelled = false;
    async function loadSession() {
      setLoadingSession(true);
      try {
        const cartToken = cart?.cartToken;
        if (!cartToken) return;
        const payload = await createCheckoutSession(accessToken, { cartToken });
        if (cancelled) return;
        setCheckoutSession(payload.session);
        setCouponCode(payload.session.coupon?.code || "");
      } catch (err) {
        if (!cancelled) {
          setStatusMessage(err instanceof Error ? err.message : STOREFRONT_STRINGS.checkout.placeOrderFailed);
          setStatusTone("error");
        }
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [ready, customer, accessToken, cart?.cartToken, hasCartItems]);

  useEffect(() => () => {
    if (!accessToken || !checkoutSession?.id || completedSessionRef.current || checkoutSession.status !== "ACTIVE") return;
    void abandonCheckoutSession(accessToken, checkoutSession.id).catch(() => {});
  }, [accessToken, checkoutSession?.id, checkoutSession?.status]);

  const saveAddress = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || savingAddress) return;

    setSavingAddress(true);
    setStatusMessage("");
    try {
      const payload = await createCustomerAddress(accessToken, form);
      const refreshed = await fetchCustomerAddresses(accessToken);
      const nextAddresses = refreshed.addresses || [];
      setAddresses(nextAddresses);
      setSelectedAddressId(payload.address.id);
      setForm(EMPTY_FORM);
      setShowAddressForm(false);
      setStatusMessage(STOREFRONT_STRINGS.checkout.addressSaved);
      setStatusTone("neutral");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.addresses.saveFailed);
      setStatusTone("error");
    } finally {
      setSavingAddress(false);
    }
  };

  const refreshSession = async (sessionId: string) => {
    if (!accessToken) return;
    const payload = await fetchCheckoutSession(accessToken, sessionId);
    setCheckoutSession(payload.session);
    setCouponCode(payload.session.coupon?.code || "");
  };

  const applyCoupon = async () => {
    if (!accessToken || !checkoutSession?.id || couponBusy) return;
    setCouponBusy(true);
    setStatusMessage("");
    try {
      const payload = await applyCheckoutCoupon(accessToken, checkoutSession.id, couponCode);
      setCheckoutSession(payload.session);
      setCouponCode(payload.session.coupon?.code || couponCode);
      setStatusMessage(STOREFRONT_STRINGS.checkout.couponApplied);
      setStatusTone("neutral");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : STOREFRONT_STRINGS.checkout.placeOrderFailed);
      setStatusTone("error");
    } finally {
      setCouponBusy(false);
    }
  };

  const clearCoupon = async () => {
    if (!accessToken || !checkoutSession?.id || couponBusy) return;
    setCouponBusy(true);
    setStatusMessage("");
    try {
      const payload = await removeCheckoutCoupon(accessToken, checkoutSession.id);
      setCheckoutSession(payload.session);
      setCouponCode("");
      setStatusMessage(STOREFRONT_STRINGS.checkout.couponRemoved);
      setStatusTone("neutral");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : STOREFRONT_STRINGS.checkout.placeOrderFailed);
      setStatusTone("error");
    } finally {
      setCouponBusy(false);
    }
  };

  const placeOrder = async (paymentStatus: "paid" | "payment_failed") => {
    if (!accessToken || placingOrder || !selectedAddressId || !checkoutSession?.id) return;

    setPlacingOrder(true);
    setStatusMessage("");
    try {
      const payload = await confirmCheckoutSession(accessToken, checkoutSession.id, {
        addressId: selectedAddressId,
        paymentStatus,
      });
      completedSessionRef.current = true;
      await refreshCart();
      setOpen(false);
      router.push(`/checkout/success/${payload.order.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : STOREFRONT_STRINGS.checkout.placeOrderFailed;
      setStatusMessage(message);
      setStatusTone("error");
      if (checkoutSession?.id) {
        try {
          await refreshSession(checkoutSession.id);
        } catch {}
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <section className="section">
      <div className="checkout-shell">
        <div>
          <div className="section-kicker">{STOREFRONT_STRINGS.checkout.confirmationTitle}</div>
          <h1 className="section-title">{STOREFRONT_STRINGS.checkout.confirmationTitle}</h1>
          <p className="section-copy">{STOREFRONT_STRINGS.checkout.confirmationSubtitle}</p>
        </div>

        {cartError ? <div className="status-banner status-banner--error">{cartError}</div> : null}
        {statusMessage ? <div className={`status-banner ${statusTone === "error" ? "status-banner--error" : ""}`}>{statusMessage}</div> : null}

        {authPending || cartLoading || loadingAddresses || loadingSession ? <div className="section-copy">{STOREFRONT_STRINGS.product.loading}</div> : null}

        {!authPending && !isRedirectingToAuth && !cartLoading && !hasCartItems ? (
          <div className="coming-soon">
            <h2 className="coming-soon__title">{STOREFRONT_STRINGS.checkout.emptyTitle}</h2>
            <p className="coming-soon__copy">{STOREFRONT_STRINGS.checkout.emptyCopy}</p>
            <Link href="/checkout" className="secondary-button">{STOREFRONT_STRINGS.checkout.title}</Link>
          </div>
        ) : null}

        {!authPending && !isRedirectingToAuth && !cartLoading && hasCartItems ? (
          <div className="checkout-layout">
            <div className="checkout-addresses">
              <div className="section-kicker">{STOREFRONT_STRINGS.checkout.addressSection}</div>
              {addresses.length ? (
                <div className="checkout-addresses__grid">
                  {addresses.map((address) => (
                    <button
                      key={address.id}
                      type="button"
                      className={`checkout-address-card ${selectedAddressId === address.id ? "is-selected" : ""}`}
                      onClick={() => setSelectedAddressId(address.id)}
                    >
                      <strong>{address.fullName}</strong>
                      <span>{address.line1}{address.line2 ? `, ${address.line2}` : ""}</span>
                      <span>{address.city}, {address.state} {address.postalCode}</span>
                      <span>{address.country}</span>
                      <span>{address.phone}</span>
                      {address.isDefault ? <span className="category-card__badge">{STOREFRONT_STRINGS.account.addresses.defaultBadge}</span> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="coming-soon">
                  <h2 className="coming-soon__title">{STOREFRONT_STRINGS.checkout.noAddressTitle}</h2>
                  <p className="coming-soon__copy">{STOREFRONT_STRINGS.checkout.noAddressCopy}</p>
                </div>
              )}

              <button type="button" className="secondary-button" onClick={() => setShowAddressForm((current) => !current)}>
                {STOREFRONT_STRINGS.checkout.addAddress}
              </button>

              {showAddressForm ? (
                <form className="account-addresses__form checkout-address-form" onSubmit={saveAddress}>
                  <div className="account-addresses__grid">
                    {ADDRESS_FIELDS.map(([field, label]) => (
                      <label key={field} className="account-auth__field">
                        <span>{label}</span>
                        <input
                          value={form[field]}
                          required={field !== "line2"}
                          onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="account-addresses__default">
                    <input
                      type="checkbox"
                      checked={form.isDefault}
                      onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
                    />
                    <span>{STOREFRONT_STRINGS.account.addresses.defaultCheckbox}</span>
                  </label>
                  <div className="account-addresses__actions">
                    <button type="submit" className="primary-button" disabled={savingAddress}>
                      {savingAddress ? STOREFRONT_STRINGS.account.auth.submit.busy : STOREFRONT_STRINGS.account.addresses.actions.save}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>

            <aside className="checkout-summary">
              <div className="section-kicker">{STOREFRONT_STRINGS.checkout.summaryTitle}</div>
              <div className="account-auth__field">
                <span>{STOREFRONT_STRINGS.checkout.couponLabel}</span>
                <div className="account-addresses__actions">
                  <input
                    value={couponCode}
                    placeholder={STOREFRONT_STRINGS.checkout.couponPlaceholder}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    disabled={couponBusy || !!checkoutSession?.coupon}
                  />
                  {!checkoutSession?.coupon ? (
                    <button type="button" className="secondary-button" disabled={couponBusy || !couponCode.trim()} onClick={() => void applyCoupon()}>
                      {STOREFRONT_STRINGS.checkout.couponApply}
                    </button>
                  ) : (
                    <button type="button" className="secondary-button" disabled={couponBusy} onClick={() => void clearCoupon()}>
                      {STOREFRONT_STRINGS.checkout.couponRemove}
                    </button>
                  )}
                </div>
              </div>
              {(cart?.items || []).map((item) => (
                <div key={item.itemId} className="checkout-summary__line">
                  <span>{item.productTitle} x {item.quantity}</span>
                  <strong>{formatMoney(Number(item.lineTotal || 0))}</strong>
                </div>
              ))}
              <div className="checkout-summary__row">
                <span>Subtotal</span>
                <strong>{formatMoney(Number(cart?.subtotal || 0))}</strong>
              </div>
              {checkoutSession?.coupon ? (
                <div className="checkout-summary__row">
                  <span>{checkoutSession.coupon.code}</span>
                  <strong>-{formatMoney(Number(checkoutSession.couponAppliedAmount || 0))}</strong>
                </div>
              ) : null}
              <div className="checkout-summary__row">
                <span>Payable</span>
                <strong>{formatMoney(Number(checkoutSession?.payableAmount ?? cart?.subtotal ?? 0))}</strong>
              </div>
              {Number(checkoutSession?.forfeitureAmount || 0) > 0 ? (
                <div className="checkout-line__warning">{STOREFRONT_STRINGS.checkout.couponForfeitureWarning}</div>
              ) : null}
              <div className="checkout-summary__actions">
                <button
                  type="button"
                  className="checkout-button"
                  disabled={!selectedAddressId || placingOrder || !checkoutSession}
                  onClick={() => placeOrder("paid")}
                >
                  {placingOrder
                    ? STOREFRONT_STRINGS.account.auth.submit.busy
                    : Number(checkoutSession?.payableAmount || 0) === 0
                      ? STOREFRONT_STRINGS.checkout.confirmOrderButton
                      : payLabel}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selectedAddressId || placingOrder || !checkoutSession}
                  onClick={() => placeOrder("payment_failed")}
                >
                  {placingOrder ? STOREFRONT_STRINGS.account.auth.submit.busy : STOREFRONT_STRINGS.checkout.paymentFailedButton}
                </button>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </section>
  );
}
