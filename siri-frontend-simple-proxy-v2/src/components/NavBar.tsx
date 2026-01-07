"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoreNavNode, UiNode } from "@/lib/types";
import { mapTree } from "@/lib/types";

/**
 * Single-column-per-level hover menu:
 * - Top-level items in the header row
 * - On hover, open a panel with columns (Level 2, Level 3, Level 4...)
 * - Hovering an item in a column opens the next column
 */

function MenuColumn({
  nodes,
  activeId,
  onHover,
}: {
  nodes: UiNode[];
  activeId?: string | null;
  onHover: (node: UiNode) => void;
}) {
  return (
    // <div className="w-64">
    <div className="w-full">
      <ul className="max-h-[60vh] overflow-auto pr-1">
        {nodes.map((n) => {
          const isActive = activeId === n.id;
          const hasChildren = (n.children?.length || 0) > 0;

          return (
            <li key={n.id}>
              <div
                onMouseEnter={() => onHover(n)}
                className={[
                  "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
                  "cursor-default select-none",
                  isActive ? "bg-gray-100" : "hover:bg-gray-50",
                ].join(" ")}
              >
                <span className="truncate">{n.label}</span>
                {hasChildren && <span className="text-gray-400">›</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Flyout({ root }: { root: UiNode }) {
  // trail[0] = selected level-2 item, trail[1] = selected level-3 item, ...
  const [trail, setTrail] = useState<UiNode[]>([]);
  useEffect(() => setTrail([]), [root.id]);

  const setActiveAtDepth = (depth: number, node: UiNode) => {
    const next = trail.slice(0, depth);
    next[depth] = node;
    setTrail(next);
  };

  const level2 = root.children || [];
  const level3 = trail[0]?.children || [];
  const level4 = trail[1]?.children || [];
  const level5 = trail[2]?.children || [];

  if (!level2.length) return <div className="p-4 text-sm text-gray-600">No sub-categories.</div>;

  return (
    <div className="w-72 max-h-[65vh] overflow-auto">
      {/* Level 2 */}
      <MenuColumn
        nodes={level2}
        activeId={trail[0]?.id || null}
        onHover={(n) => setActiveAtDepth(0, n)}
      />

      {/* Level 3 (down) */}
      {level3.length > 0 && (
        <div className="border-t">
          <MenuColumn
            nodes={level3}
            activeId={trail[1]?.id || null}
            onHover={(n) => setActiveAtDepth(1, n)}
          />
        </div>
      )}

      {/* Level 4 (down) */}
      {level4.length > 0 && (
        <div className="border-t">
          <MenuColumn
            nodes={level4}
            activeId={trail[2]?.id || null}
            onHover={(n) => setActiveAtDepth(2, n)}
          />
        </div>
      )}

      {/* Level 5 (down) - optional */}
      {level5.length > 0 && (
        <div className="border-t">
          <MenuColumn
            nodes={level5}
            activeId={trail[3]?.id || null}
            onHover={(n) => setActiveAtDepth(3, n)}
          />
        </div>
      )}
    </div>
  );
}

export function NavBar() {
  const endpoint = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/store/navigation`;
  const [tree, setTree] = useState<UiNode[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setErr(null);
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rawTree: StoreNavNode[] = Array.isArray(data?.tree) ? data.tree : [];
        const mapped = mapTree(rawTree);
        if (!cancelled) setTree(mapped);
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Failed to load navigation");
          setTree(null);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(() => {
    if (err) return <div className="text-xs text-red-600">Menu failed to load from API. ({err})</div>;
    if (!tree) return <div className="text-xs text-gray-500">Loading menu…</div>;

    return (
      <ul className="flex items-center gap-6">
        {tree.map((top) => {
          const hasChildren = (top.children?.length || 0) > 0;

          return (
            <li key={top.id} className="relative group">
              <div className="text-sm cursor-default whitespace-nowrap px-1 py-1">
                {top.label}
              </div>

              {hasChildren && (
                <>
                  {/* small hover bridge so dropdown doesn't disappear */}
                  <div className="absolute left-0 top-full h-3 w-40" />

                  <div className="absolute left-0 top-full hidden group-hover:block pt-3 z-50">
                    <div className="rounded-md border bg-white shadow-xl overflow-hidden">
                      {/* <div className="px-4 py-3 border-b bg-gray-50">
                        <div className="text-xs font-medium tracking-wide text-gray-700 uppercase">
                          {top.label}
                        </div>
                      </div> */}
                      <Flyout root={top} />
                    </div>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    );
  }, [tree, err]);

  return (
    <header className="border-b bg-white sticky top-0 z-40">
      <div className="bg-black text-white text-xs">
        <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-center">
          COD &amp; Free Shipping Above Rs. 2500/-
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-6">
        <div className="text-lg font-semibold tracking-tight whitespace-nowrap">Siri Collections</div>
        <nav className="flex-1">{content}</nav>
      </div>
    </header>
  );
}
