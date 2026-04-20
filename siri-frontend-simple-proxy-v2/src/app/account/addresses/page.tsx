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
  ["fullName", "Full Name"],
  ["phone", "Phone"],
  ["line1", "Address Line 1"],
  ["line2", "Address Line 2"],
  ["city", "City"],
  ["state", "State"],
  ["postalCode", "Postal Code"],
  ["country", "Country"],
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load addresses");
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
      setError(err instanceof Error ? err.message : "Unable to save address");
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
    <AccountShell title="Saved Addresses" subtitle="Save delivery addresses for a faster checkout when customer ordering is enabled.">
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
            <span>Set as default address</span>
          </label>
          <div className="account-addresses__actions">
            <button type="submit" className="primary-button">{editing ? "Update Address" : "Save Address"}</button>
            {editing ? (
              <button type="button" className="secondary-button" onClick={() => setForm(EMPTY_FORM)}>Cancel</button>
            ) : null}
          </div>
        </form>

        <div className="account-addresses__list">
          {addresses.length ? addresses.map((address) => (
            <div key={address.id} className="account-addresses__item">
              <div className="account-addresses__item-head">
                <strong>{address.fullName}</strong>
                {address.isDefault ? <span className="category-card__badge">Default</span> : null}
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
                <button type="button" className="secondary-button" onClick={() => setForm(address)}>Edit</button>
                <button type="button" className="secondary-button" onClick={() => removeAddress(address.id)}>Delete</button>
              </div>
            </div>
          )) : (
            <div className="coming-soon">
              <h2 className="coming-soon__title">No saved addresses yet.</h2>
              <p className="coming-soon__copy">Add your first address to make future checkout faster.</p>
            </div>
          )}
        </div>
      </div>
    </AccountShell>
  );
}
