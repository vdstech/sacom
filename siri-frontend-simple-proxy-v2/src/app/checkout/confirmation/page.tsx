"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";
import { useStoreCart } from "@/components/StoreProvider";
import {
  createCustomerAddress,
  createCustomerOrder,
  fetchCustomerAddresses,
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
  const { ready, customer, accessToken } = useAccount();
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
  const payLabel = useMemo(
    () => STOREFRONT_STRINGS.checkout.payButton(formatMoney(Number(cart?.subtotal || 0))),
    [cart?.subtotal]
  );

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

  const placeOrder = async (paymentStatus: "paid" | "payment_failed") => {
    if (!accessToken || placingOrder || !selectedAddressId || !cart?.cartToken) return;

    setPlacingOrder(true);
    setStatusMessage("");
    try {
      const payload = await createCustomerOrder(accessToken, {
        cartToken: cart.cartToken,
        addressId: selectedAddressId,
        paymentStatus,
      });
      if (paymentStatus !== "payment_failed") {
        await refreshCart();
        setOpen(false);
      }
      router.push(`/checkout/success/${payload.order.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : STOREFRONT_STRINGS.checkout.placeOrderFailed;
      setStatusMessage(message);
      setStatusTone("error");
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

        {cartLoading || loadingAddresses ? <div className="section-copy">{STOREFRONT_STRINGS.product.loading}</div> : null}

        {!cartLoading && !hasCartItems ? (
          <div className="coming-soon">
            <h2 className="coming-soon__title">{STOREFRONT_STRINGS.checkout.emptyTitle}</h2>
            <p className="coming-soon__copy">{STOREFRONT_STRINGS.checkout.emptyCopy}</p>
            <Link href="/checkout" className="secondary-button">{STOREFRONT_STRINGS.checkout.title}</Link>
          </div>
        ) : null}

        {!cartLoading && hasCartItems ? (
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
              <div className="checkout-summary__actions">
                <button
                  type="button"
                  className="checkout-button"
                  disabled={!selectedAddressId || placingOrder}
                  onClick={() => placeOrder("paid")}
                >
                  {placingOrder ? STOREFRONT_STRINGS.account.auth.submit.busy : payLabel}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selectedAddressId || placingOrder}
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
