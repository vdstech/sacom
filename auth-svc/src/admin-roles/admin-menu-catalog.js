export const ADMIN_MENU_IDS = [
  "profile",
  "sessions",
  "users",
  "roles",
  "permissions",
  "ordersDashboard",
  "ordersMetrics",
  "processingManager",
  "packagingManager",
  "shippingOperator",
  "cancellationManager",
  "returnExchangeManager",
  "categories",
  "products",
  "orders",
  "inventory",
  "systemHealth",
  "audit",
];

export function normalizeVisibleMenus(input = []) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const next = [];

  for (const value of input) {
    const normalized = String(value || "").trim();
    if (!normalized || !ADMIN_MENU_IDS.includes(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }

  return next;
}
