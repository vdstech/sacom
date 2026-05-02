"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AccountPanel } from "@/components/AccountPanel";
import { useAccount } from "@/components/AccountProvider";
import { fetchCategoryTree } from "@/lib/storeApi";
import type { UiNode } from "@/lib/types";
import { mapCategoryTree, toErrorMessage } from "@/lib/storefront";
import { STOREFRONT_STRINGS } from "@/lib/strings";
import { useStoreCart } from "@/components/StoreProvider";

function normalizeNavValue(value: string) {
  return String(value || "").trim().toLowerCase();
}

function isStaticDuplicateNav(node: UiNode) {
  const label = normalizeNavValue(node.label);
  const href = normalizeNavValue(node.href);
  return label === "home" || label === "new arrivals" || href === "/" || href === "/new-arrivals";
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="header-icon-svg">
      <path
        d="M12 12.25a4.25 4.25 0 1 0-4.25-4.25A4.25 4.25 0 0 0 12 12.25Zm0 1.5c-4.27 0-7.75 2.6-7.75 5.8a.75.75 0 0 0 .75.75h14a.75.75 0 0 0 .75-.75c0-3.2-3.48-5.8-7.75-5.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="header-icon-svg">
      <path
        d="M8.25 20.25a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM4.03 4.75h1.6l1.54 7.22a2.25 2.25 0 0 0 2.2 1.78h6.8a2.25 2.25 0 0 0 2.14-1.56l1.56-4.68a1.75 1.75 0 0 0-1.66-2.31H7.1l-.25-1.18A.75.75 0 0 0 6.12 3.5H4.03a.75.75 0 0 0 0 1.5Zm3.39 1.95h10.79a.25.25 0 0 1 .24.33l-1.56 4.69a.75.75 0 0 1-.72.53h-6.8a.75.75 0 0 1-.73-.59L7.42 6.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="header-icon-svg">
      <path
        d="M4.75 7.25h14.5a.75.75 0 0 0 0-1.5H4.75a.75.75 0 0 0 0 1.5Zm14.5 4h-14.5a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5Zm0 5.5H4.75a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`mobile-nav__chevron ${expanded ? "is-open" : ""}`}
    >
      <path
        d="M6.47 7.97a.75.75 0 0 1 1.06 0L10 10.44l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

function InlineChevron({ expanded = false, className = "" }: { expanded?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`${className} ${expanded ? "is-open" : ""}`.trim()}
    >
      <path
        d="M6.47 7.97a.75.75 0 0 1 1.06 0L10 10.44l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuColumn({
  nodes,
  activeId,
  onActivate,
  onNavigate,
}: {
  nodes: UiNode[];
  activeId?: string | null;
  onActivate: (node: UiNode) => void;
  onNavigate: () => void;
}) {
  return (
    <div className="nav-column">
      <ul>
        {nodes.map((node) => {
          const isActive = activeId === node.id;
          const hasChildren = !!node.children?.length;
          return (
            <li key={node.id}>
              <Link
                href={node.href || "#"}
                onMouseEnter={() => onActivate(node)}
                onFocus={() => onActivate(node)}
                onClick={onNavigate}
                className={`nav-column__link ${isActive ? "is-active" : ""}`}
              >
                <span>{node.label}</span>
                {hasChildren ? <InlineChevron className="nav-column__chevron" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Flyout({ root, onNavigate }: { root: UiNode; onNavigate: () => void }) {
  const [trail, setTrail] = useState<UiNode[]>([]);

  useEffect(() => setTrail([]), [root.id]);

  const setActiveAtDepth = (depth: number, node: UiNode) => {
    const next = trail.slice(0, depth);
    next[depth] = node;
    setTrail(next);
  };

  const columns = [
    root.children || [],
    trail[0]?.children || [],
    trail[1]?.children || [],
    trail[2]?.children || [],
  ].filter((column) => column.length);

  return (
    <div className="nav-flyout__grid">
      {columns.map((nodes, index) => (
        <MenuColumn
          key={`${root.id}-${index}`}
          nodes={nodes}
          activeId={trail[index]?.id || null}
          onActivate={(node) => setActiveAtDepth(index, node)}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function MobileMenuList({
  nodes,
  expandedIds,
  onToggle,
  onNavigate,
  depth = 0,
}: {
  nodes: UiNode[];
  expandedIds: string[];
  onToggle: (nodeId: string) => void;
  onNavigate: () => void;
  depth?: number;
}) {
  return (
    <ul className={`mobile-nav__list ${depth ? "is-nested" : ""}`}>
      {nodes.map((node) => {
        const hasChildren = !!node.children?.length;
        const expanded = expandedIds.includes(node.id);
        return (
          <li key={node.id} className="mobile-nav__item">
            {hasChildren ? (
              <button
                type="button"
                className="mobile-nav__row mobile-nav__row--button"
                style={{ paddingLeft: `${depth * 0.9}rem` }}
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${node.label}`}
                onClick={() => onToggle(node.id)}
              >
                <span className="mobile-nav__link">
                  <span>{node.label}</span>
                  <ChevronIcon expanded={expanded} />
                </span>
              </button>
            ) : (
              <div className="mobile-nav__row" style={{ paddingLeft: `${depth * 0.9}rem` }}>
                <Link href={node.href || "#"} className="mobile-nav__link" onClick={onNavigate}>
                  <span>{node.label}</span>
                </Link>
              </div>
            )}
            {hasChildren && expanded ? (
              <MobileMenuList
                nodes={node.children || []}
                expandedIds={expandedIds}
                onToggle={onToggle}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const [tree, setTree] = useState<UiNode[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRootId, setOpenRootId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedIds, setMobileExpandedIds] = useState<string[]>([]);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [panelLeft, setPanelLeft] = useState(0);
  const { cart, setOpen } = useStoreCart();
  const { customer } = useAccount();
  const navShellRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topLevelRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setErr(null);
        const rawTree = await fetchCategoryTree();
        const mapped = mapCategoryTree(rawTree);
        if (!cancelled) setTree(mapped);
      } catch (error) {
        if (!cancelled) {
          setErr(toErrorMessage(error, "Failed to load navigation"));
          setTree(null);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const topLevel = useMemo<UiNode[]>(
    () => ([
      { id: "static-home", label: STOREFRONT_STRINGS.navigation.home, href: "/" },
      { id: "static-new-arrivals", label: STOREFRONT_STRINGS.navigation.newArrivals, href: "/new-arrivals" },
      ...((tree || []).filter((node) => !isStaticDuplicateNav(node))),
    ]),
    [tree]
  );
  const openRoot = useMemo(
    () => topLevel.find((node) => node.id === openRootId && node.children?.length) || null,
    [openRootId, topLevel]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1100px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    setOpenRootId(null);
    setAccountOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileMenuOpen(false);
      setMobileExpandedIds([]);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    document.body.classList.add("body-scroll-lock");
    return () => document.body.classList.remove("body-scroll-lock");
  }, [mobileMenuOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!openRootId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenRootId(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openRootId]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!openRootId) {
      setPanelLeft(0);
      return;
    }

    const updatePanelPosition = () => {
      const navShell = navShellRef.current;
      const panel = panelRef.current;
      const trigger = topLevelRefs.current[openRootId];
      if (!navShell || !panel || !trigger) return;

      const navShellRect = navShell.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const desiredLeft = triggerRect.left - navShellRect.left;
      const maxLeft = Math.max(0, navShellRect.width - panelRect.width);
      const clampedLeft = Math.min(Math.max(0, desiredLeft), maxLeft);
      setPanelLeft(clampedLeft);
    };

    updatePanelPosition();

    let frameId = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updatePanelPosition);
    };

    window.addEventListener("resize", scheduleUpdate);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleUpdate);
      if (navShellRef.current) resizeObserver.observe(navShellRef.current);
      if (panelRef.current) resizeObserver.observe(panelRef.current);
      if (topLevelRefs.current[openRootId]) resizeObserver.observe(topLevelRefs.current[openRootId] as Element);
    }

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, [openRootId]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpenRootId(null);
      closeTimerRef.current = null;
    }, 140);
  };

  const openMenu = (nodeId: string) => {
    clearCloseTimer();
    setAccountOpen(false);
    setMobileMenuOpen(false);
    setOpenRootId(nodeId);
  };

  const toggleMobileSection = (nodeId: string) => {
    setMobileExpandedIds((current) =>
      current.includes(nodeId) ? current.filter((entry) => entry !== nodeId) : [...current, nodeId]
    );
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleTopLevelClick = (
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    nodeId: string,
    hasChildren: boolean
  ) => {
    if (!hasChildren) {
      setOpenRootId(null);
      return;
    }

    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches) {
      event.preventDefault();
      setOpenRootId((current) => current === nodeId ? null : nodeId);
    }
  };

  return (
    <header className="site-header">
      <div className="site-header__promo">COD &amp; Free Shipping Above Rs. 2500/-</div>

      <div className="site-header__inner">
        <div className="site-header__brand">
          <Link href="/" aria-label="Siri home">
            <img src="/brand/siri-logo.png" alt="Siri" className="site-header__logo" />
          </Link>
        </div>

        <div
          className="site-header__nav-shell"
          ref={navShellRef}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <nav className="site-header__nav" aria-label="Primary">
            {err ? <div className="nav-error">Menu unavailable</div> : null}
            {topLevel.map((top) => {
              const hasChildren = !!top.children?.length;
              const isOpen = openRootId === top.id;
              return (
                <div key={top.id} className={`nav-item ${isOpen ? "is-open" : ""}`}>
                  <Link
                    href={top.href || "#"}
                    className="nav-item__link"
                    aria-expanded={hasChildren ? isOpen : undefined}
                    ref={(node) => {
                      topLevelRefs.current[top.id] = node;
                    }}
                    onMouseEnter={() => {
                      if (hasChildren) openMenu(top.id);
                      else setOpenRootId(null);
                    }}
                    onFocus={() => {
                      if (hasChildren) openMenu(top.id);
                    }}
                    onClick={(event) => handleTopLevelClick(event, top.id, hasChildren)}
                  >
                    {top.label}
                  </Link>
                </div>
              );
            })}
          </nav>

          {openRoot ? (
            <div className="site-header__panel" ref={panelRef} style={{ left: `${panelLeft}px` }}>
              <Flyout root={openRoot} onNavigate={() => setOpenRootId(null)} />
            </div>
          ) : null}
        </div>

        <div className="site-header__actions">
          <button
            type="button"
            className="header-icon-button site-header__menu-button"
            aria-label={mobileMenuOpen ? STOREFRONT_STRINGS.navigation.closeMenu : STOREFRONT_STRINGS.navigation.menu}
            aria-expanded={mobileMenuOpen}
            onClick={() => {
              setAccountOpen(false);
              setOpenRootId(null);
              setMobileMenuOpen((current) => !current);
            }}
          >
            <MenuIcon />
          </button>
          <div className="account-trigger" ref={accountRef}>
            <button
              type="button"
              className={`header-icon-button ${accountOpen ? "is-active" : ""}`}
              aria-label="Account"
              aria-expanded={accountOpen}
              onClick={() => {
                setMobileMenuOpen(false);
                setOpenRootId(null);
                setAccountOpen((current) => !current);
              }}
            >
              <AccountIcon />
            </button>
            {accountOpen ? <AccountPanel onNavigate={() => setAccountOpen(false)} /> : null}
          </div>
          <button type="button" className="header-icon-button header-cart-button" aria-label="Cart" onClick={() => setOpen(true)}>
            <CartIcon />
            <span className="header-cart-badge">{cart?.itemCount || 0}</span>
          </button>
        </div>
      </div>

      <div
        className={`mobile-nav-backdrop ${mobileMenuOpen ? "is-open" : ""}`}
        aria-hidden={!mobileMenuOpen}
        onClick={closeMobileMenu}
      />
      <aside className={`mobile-nav-drawer ${mobileMenuOpen ? "is-open" : ""}`} aria-hidden={!mobileMenuOpen}>
        <div className="mobile-nav__header">
          <div>
            <div className="section-kicker">{STOREFRONT_STRINGS.navigation.browseStore}</div>
            <h2>{STOREFRONT_STRINGS.navigation.menu}</h2>
          </div>
          <button type="button" className="mobile-nav__close" onClick={closeMobileMenu}>
            {STOREFRONT_STRINGS.navigation.closeMenu}
          </button>
        </div>

        <div className="mobile-nav__content">
          <div className="mobile-nav__section">
            <div className="section-kicker">{STOREFRONT_STRINGS.navigation.browseStore}</div>
            <MobileMenuList
              nodes={topLevel}
              expandedIds={mobileExpandedIds}
              onToggle={toggleMobileSection}
              onNavigate={closeMobileMenu}
            />
          </div>

          <div className="mobile-nav__quicklinks">
            <button
              type="button"
              className="mobile-nav__shortcut"
              onClick={() => {
                closeMobileMenu();
                setOpen(true);
              }}
            >
              {STOREFRONT_STRINGS.navigation.cartLabel} ({cart?.itemCount || 0})
            </button>
            <Link href={customer ? "/account/orders" : "/account/auth"} className="mobile-nav__shortcut" onClick={closeMobileMenu}>
              {customer
                ? STOREFRONT_STRINGS.navigation.account.customerAccount
                : STOREFRONT_STRINGS.navigation.account.loginSignup}
            </Link>
          </div>

          {customer ? (
            <div className="mobile-nav__section">
              <div className="section-kicker">{STOREFRONT_STRINGS.navigation.account.customerAccount}</div>
              <div className="mobile-nav__account-links">
                <Link href="/account/orders" className="mobile-nav__shortcut" onClick={closeMobileMenu}>
                  {STOREFRONT_STRINGS.navigation.account.orders}
                </Link>
                <Link href="/account/wishlist" className="mobile-nav__shortcut" onClick={closeMobileMenu}>
                  {STOREFRONT_STRINGS.navigation.account.wishlist}
                </Link>
                <Link href="/account/addresses" className="mobile-nav__shortcut" onClick={closeMobileMenu}>
                  {STOREFRONT_STRINGS.navigation.account.savedAddresses}
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </header>
  );
}
