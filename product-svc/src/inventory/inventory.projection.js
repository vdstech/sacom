function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export function resolveCanonicalAvailableQuantity(entry) {
  const availableQty = Number(entry?.availableQty);
  if (Number.isFinite(availableQty)) return Math.max(0, availableQty);
  return Math.max(0, asNumber(entry?.quantity, 0));
}

export function normalizeInventoryProjectionEntry(entry = {}) {
  const stockKey = normalizeString(entry?.stockKey).toUpperCase();
  const availableQty = resolveCanonicalAvailableQuantity(entry);
  return {
    stockKey,
    sizeLabel: normalizeString(entry?.sizeLabel),
    quantity: availableQty,
    availableQty,
    reservedQty: Math.max(0, asNumber(entry?.reservedQty, 0)),
    damagedQty: Math.max(0, asNumber(entry?.damagedQty, 0)),
    lostQty: Math.max(0, asNumber(entry?.lostQty, 0)),
    reorderLevel: Math.max(0, asNumber(entry?.reorderLevel, 0)),
  };
}

export function projectionEntryDiffers(inventoryEntry = {}, variantEntry = null) {
  if (!variantEntry) return true;
  const canonicalInventory = normalizeInventoryProjectionEntry(inventoryEntry);
  const canonicalVariant = normalizeInventoryProjectionEntry(variantEntry);
  return (
    canonicalInventory.stockKey !== canonicalVariant.stockKey ||
    canonicalInventory.sizeLabel !== canonicalVariant.sizeLabel ||
    canonicalInventory.quantity !== canonicalVariant.quantity ||
    canonicalInventory.availableQty !== canonicalVariant.availableQty ||
    canonicalInventory.reservedQty !== canonicalVariant.reservedQty ||
    canonicalInventory.damagedQty !== canonicalVariant.damagedQty ||
    canonicalInventory.lostQty !== canonicalVariant.lostQty ||
    canonicalInventory.reorderLevel !== canonicalVariant.reorderLevel
  );
}

export function overlayVariantStockWithInventory(variant = {}, inventoryRows = []) {
  const existingStock = Array.isArray(variant?.stock) ? variant.stock : [];
  const inventoryByKey = new Map(
    (Array.isArray(inventoryRows) ? inventoryRows : [])
      .map((row) => [normalizeString(row?.stockKey).toUpperCase(), row])
      .filter(([stockKey]) => !!stockKey)
  );
  const seenKeys = new Set();
  let projectionMismatch = false;

  const stock = existingStock
    .map((entry) => {
      const stockKey = normalizeString(entry?.stockKey).toUpperCase();
      if (!stockKey) return null;
      const inventoryEntry = inventoryByKey.get(stockKey);
      seenKeys.add(stockKey);
      if (!inventoryEntry) {
        projectionMismatch = true;
        return normalizeInventoryProjectionEntry(entry);
      }
      if (projectionEntryDiffers(inventoryEntry, entry)) projectionMismatch = true;
      return normalizeInventoryProjectionEntry(inventoryEntry);
    })
    .filter(Boolean);

  for (const [stockKey, inventoryEntry] of inventoryByKey.entries()) {
    if (seenKeys.has(stockKey)) continue;
    projectionMismatch = true;
    stock.push(normalizeInventoryProjectionEntry(inventoryEntry));
  }

  return {
    ...variant,
    stock,
    projectionMismatch,
  };
}
