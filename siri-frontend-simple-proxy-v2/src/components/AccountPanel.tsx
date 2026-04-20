"use client";

import Link from "next/link";
import { useAccount } from "@/components/AccountProvider";

export function AccountPanel({ onNavigate }: { onNavigate: () => void }) {
  const { customer, logout } = useAccount();

  const guestLinks = [
    { href: "/account/orders", label: "Orders" },
    { href: "/account/wishlist", label: "Wishlist" },
    { href: "/account/addresses", label: "Saved Addresses" },
  ];

  return (
    <div className="account-panel">
      {customer ? (
        <>
          <div className="account-panel__summary">
            <div className="account-panel__welcome">Hello {customer.name}</div>
            <div className="account-panel__subtext">{customer.email}</div>
          </div>
          <div className="account-panel__divider" />
          <div className="account-panel__links">
            <Link href="/account/orders" onClick={onNavigate}>Orders</Link>
            <Link href="/account/wishlist" onClick={onNavigate}>Wishlist</Link>
            <Link href="/account/addresses" onClick={onNavigate}>Saved Addresses</Link>
          </div>
          <div className="account-panel__divider" />
          <button
            type="button"
            className="account-panel__ghost"
            onClick={async () => {
              await logout();
              onNavigate();
            }}
          >
            Logout
          </button>
        </>
      ) : (
        <>
          <div className="account-panel__summary">
            <div className="account-panel__welcome">Welcome</div>
            <div className="account-panel__subtext">To access account and manage orders</div>
          </div>
          <Link href="/account/auth" className="account-panel__primary" onClick={onNavigate}>
            Login / Signup
          </Link>
          <div className="account-panel__divider" />
          <div className="account-panel__links">
            {guestLinks.map((item) => (
              <Link key={item.href} href={`${item.href}?returnTo=${encodeURIComponent(item.href)}`} onClick={onNavigate}>
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
