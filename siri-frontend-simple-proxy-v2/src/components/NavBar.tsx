"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccountPanel } from "@/components/AccountPanel";
import { useAccount } from "@/components/AccountProvider";
import { fetchCategoryTree } from "@/lib/storeApi";
import type { UiNode } from "@/lib/types";
import { mapCategoryTree, toErrorMessage } from "@/lib/storefront";
import { useStoreCart } from "@/components/StoreProvider";

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
                {hasChildren ? <span>›</span> : null}
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

export function NavBar() {
  const [tree, setTree] = useState<UiNode[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRootId, setOpenRootId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
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

  const topLevel = useMemo(() => tree || [], [tree]);
  const openRoot = useMemo(
    () => topLevel.find((node) => node.id === openRootId && node.children?.length) || null,
    [openRootId, topLevel]
  );

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
    setOpenRootId(nodeId);
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
          <div className="account-trigger" ref={accountRef}>
            <button
              type="button"
              className={`header-icon-button ${accountOpen ? "is-active" : ""}`}
              aria-label="Account"
              aria-expanded={accountOpen}
              onClick={() => {
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
    </header>
  );
}
