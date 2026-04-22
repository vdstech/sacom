"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/AccountShell";
import { useAccount } from "@/components/AccountProvider";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  fetchCustomerAddresses,
  updateCustomerAddress,
  type CustomerAddress,
} from "@/lib/accountApi";
import { STOREFRONT_STRINGS } from "@/lib/strings";

const EMPTY_FORM = {
  id: "",
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

export default function AddressesPage() {
  const router = useRouter();
  const { ready, customer, accessToken } = useAccount();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [form, setForm] = useState<Omit<CustomerAddress, "id"> & { id?: string }>(EMPTY_FORM);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!customer || !accessToken) {
      router.replace(`/account/auth?returnTo=${encodeURIComponent("/account/addresses")}`);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const payload = await fetchCustomerAddresses(accessToken);
        if (!cancelled) setAddresses(payload.addresses || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.addresses.fallbackError);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ready, customer, accessToken, router]);

  const editing = useMemo(() => !!form.id, [form.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    try {
      setError("");
      if (form.id) {
        const payload = await updateCustomerAddress(accessToken, form.id, form);
        setAddresses((current) => current.map((item) => item.id === form.id ? payload.address : item));
      } else {
        const payload = await createCustomerAddress(accessToken, form as Omit<CustomerAddress, "id">);
        setAddresses((current) => [payload.address, ...current.filter((item) => !payload.address.isDefault || !item.isDefault)]);
      }
      const refreshed = await fetchCustomerAddresses(accessToken);
      setAddresses(refreshed.addresses || []);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.addresses.saveFailed);
    }
  };

  const removeAddress = async (id: string) => {
    if (!accessToken) return;
    await deleteCustomerAddress(accessToken, id);
    const refreshed = await fetchCustomerAddresses(accessToken);
    setAddresses(refreshed.addresses || []);
    if (form.id === id) setForm(EMPTY_FORM);
  };

  return (
    <AccountShell title={STOREFRONT_STRINGS.account.addresses.title} subtitle={STOREFRONT_STRINGS.account.addresses.subtitle}>
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}
      <div className="account-addresses">
        <form className="account-addresses__form" onSubmit={submit}>
          <div className="account-addresses__grid">
            {ADDRESS_FIELDS.map(([field, label]) => (
              <label key={field} className="account-auth__field">
                <span>{label}</span>
                <input
                  value={form[field] || ""}
                  onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                  required={field !== "line2"}
                />
              </label>
            ))}
          </div>
          <label className="account-addresses__default">
            <input
              type="checkbox"
              checked={!!form.isDefault}
              onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
            />
            <span>{STOREFRONT_STRINGS.account.addresses.defaultCheckbox}</span>
          </label>
          <div className="account-addresses__actions">
            <button type="submit" className="primary-button">{editing ? STOREFRONT_STRINGS.account.addresses.actions.update : STOREFRONT_STRINGS.account.addresses.actions.save}</button>
            {editing ? (
              <button type="button" className="secondary-button" onClick={() => setForm(EMPTY_FORM)}>{STOREFRONT_STRINGS.account.addresses.actions.cancel}</button>
            ) : null}
          </div>
        </form>

        <div className="account-addresses__list">
          {addresses.length ? addresses.map((address) => (
            <div key={address.id} className="account-addresses__item">
              <div className="account-addresses__item-head">
                <strong>{address.fullName}</strong>
                {address.isDefault ? <span className="category-card__badge">{STOREFRONT_STRINGS.account.addresses.defaultBadge}</span> : null}
              </div>
              <p className="section-copy">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
                <br />
                {address.city}, {address.state} {address.postalCode}
                <br />
                {address.country}
                <br />
                {address.phone}
              </p>
              <div className="account-addresses__item-actions">
                <button type="button" className="secondary-button" onClick={() => setForm(address)}>{STOREFRONT_STRINGS.account.addresses.actions.edit}</button>
                <button type="button" className="secondary-button" onClick={() => removeAddress(address.id)}>{STOREFRONT_STRINGS.account.addresses.actions.delete}</button>
              </div>
            </div>
          )) : (
            <div className="coming-soon">
              <h2 className="coming-soon__title">{STOREFRONT_STRINGS.account.addresses.emptyTitle}</h2>
              <p className="coming-soon__copy">{STOREFRONT_STRINGS.account.addresses.emptyCopy}</p>
            </div>
          )}
        </div>
      </div>
    </AccountShell>
  );
}
