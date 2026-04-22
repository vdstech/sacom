"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { STOREFRONT_STRINGS } from "@/lib/strings";

const NAV_ITEMS = [
  { href: "/account/orders", label: STOREFRONT_STRINGS.navigation.account.orders },
  { href: "/account/wishlist", label: STOREFRONT_STRINGS.navigation.account.wishlist },
  { href: "/account/addresses", label: STOREFRONT_STRINGS.navigation.account.savedAddresses },
];

export function AccountShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <section className="section">
      <div className="account-shell">
        <aside className="account-shell__sidebar">
          <div className="section-kicker">{STOREFRONT_STRINGS.account.shell.title}</div>
          <h1 className="section-title">{title}</h1>
          {subtitle ? <p className="section-copy">{subtitle}</p> : null}
          <nav className="account-shell__nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`account-shell__nav-link ${pathname === item.href ? "is-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="account-shell__content">{children}</div>
      </div>
    </section>
  );
}
