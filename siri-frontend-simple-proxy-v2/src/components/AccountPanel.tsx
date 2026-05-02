"use client";

import Link from "next/link";
import { useAccount } from "@/components/AccountProvider";
import { STOREFRONT_STRINGS } from "@/lib/strings";

export function AccountPanel({ onNavigate }: { onNavigate: () => void }) {
  const { customer, logout } = useAccount();

  const guestLinks = [
    { href: "/account/orders", label: STOREFRONT_STRINGS.navigation.account.orders },
    { href: "/account/coupons", label: STOREFRONT_STRINGS.navigation.account.coupons },
    { href: "/account/wishlist", label: STOREFRONT_STRINGS.navigation.account.wishlist },
    { href: "/account/addresses", label: STOREFRONT_STRINGS.navigation.account.savedAddresses },
  ];

  return (
    <div className="account-panel">
      {customer ? (
        <>
          <div className="account-panel__summary">
            <div className="account-panel__welcome">{STOREFRONT_STRINGS.navigation.account.welcomeBack} {customer.name}</div>
            <div className="account-panel__subtext">{customer.email}</div>
          </div>
          <div className="account-panel__divider" />
          <div className="account-panel__links">
            <Link href="/account/orders" onClick={onNavigate}>{STOREFRONT_STRINGS.navigation.account.orders}</Link>
            <Link href="/account/coupons" onClick={onNavigate}>{STOREFRONT_STRINGS.navigation.account.coupons}</Link>
            <Link href="/account/wishlist" onClick={onNavigate}>{STOREFRONT_STRINGS.navigation.account.wishlist}</Link>
            <Link href="/account/addresses" onClick={onNavigate}>{STOREFRONT_STRINGS.navigation.account.savedAddresses}</Link>
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
            {STOREFRONT_STRINGS.navigation.account.logout}
          </button>
        </>
      ) : (
        <>
          <div className="account-panel__summary">
            <div className="account-panel__welcome">{STOREFRONT_STRINGS.navigation.account.welcome}</div>
            <div className="account-panel__subtext">{STOREFRONT_STRINGS.navigation.account.guestSubtitle}</div>
          </div>
          <Link href="/account/auth" className="account-panel__primary" onClick={onNavigate}>
            {STOREFRONT_STRINGS.navigation.account.loginSignup}
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
