import mongoose from "mongoose";
import StorefrontInventoryRead from "./customer-orders.storefront-inventory.model.js";
import StorefrontVariantRead from "./customer-orders.storefront-variant.model.js";

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function createHttpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hasPersistedField(entry, fieldName) {
  if (!entry || typeof entry !== "object" || !fieldName) return false;
  if (typeof entry.$isDefault === "function" && entry.$isDefault(fieldName)) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(entry, fieldName);
}

export function resolveAvailableStockQuantity(entry) {
  const availableQtyRaw = hasPersistedField(entry, "availableQty")
    ? asNumber(entry?.availableQty, Number.NaN)
    : Number.NaN;
  const quantity = Math.max(0, asNumber(entry?.quantity, 0));
  const availableQty = Number.isFinite(availableQtyRaw) ? Math.max(0, availableQtyRaw) : Number.NaN;

  if (Number.isFinite(availableQty)) return availableQty;
  return quantity;
}

function getAvailableQuantity(entry) {
  return resolveAvailableStockQuantity(entry);
}

function getReservedQuantity(entry) {
  return Math.max(0, asNumber(entry?.reservedQty, 0));
}

function getDamagedQuantity(entry) {
  return Math.max(0, asNumber(entry?.damagedQty, 0));
}

function getLostQuantity(entry) {
  return Math.max(0, asNumber(entry?.lostQty, 0));
}

export function buildStockOperationFromOrderItem(item) {
  return {
    productId: String(item?.productId || "").trim(),
    variantId: String(item?.variantId || "").trim(),
    stockKey: normalizeString(item?.stockKey).toUpperCase(),
    quantity: Math.max(1, Math.floor(asNumber(item?.quantity, 1))),
  };
}

export function isValidStockOperation(operation) {
  return !!operation?.stockKey &&
    mongoose.isValidObjectId(operation?.productId) &&
    mongoose.isValidObjectId(operation?.variantId);
}

async function loadInventoryRow(operation) {
  const inventoryRow = await StorefrontInventoryRead.findOne({
    stockKey: operation.stockKey,
    productId: operation.productId,
    variantId: operation.variantId,
  });

  if (!inventoryRow) {
    throw createHttpError("Inventory row not found for this stock item", 404);
  }

  const variant = await StorefrontVariantRead.findOne({
    _id: operation.variantId,
    productId: operation.productId,
  });

  if (!variant) {
    throw createHttpError("Variant stock not found for this order item", 404);
  }

  const stockEntry = Array.isArray(variant.stock)
    ? variant.stock.find((entry) => normalizeString(entry?.stockKey).toUpperCase() === operation.stockKey)
    : null;

  if (!stockEntry) {
    throw createHttpError("Variant stock entry not found for this order item", 404);
  }

  return { inventoryRow, variant, stockEntry };
}

async function saveInventoryRow({ inventoryRow, variant, stockEntry }) {
  inventoryRow.quantity = getAvailableQuantity(inventoryRow);
  inventoryRow.availableQty = getAvailableQuantity(inventoryRow);
  inventoryRow.reservedQty = getReservedQuantity(inventoryRow);
  inventoryRow.damagedQty = getDamagedQuantity(inventoryRow);
  inventoryRow.lostQty = getLostQuantity(inventoryRow);

  stockEntry.quantity = inventoryRow.quantity;
  stockEntry.availableQty = inventoryRow.availableQty;
  stockEntry.reservedQty = inventoryRow.reservedQty;
  stockEntry.damagedQty = inventoryRow.damagedQty;
  stockEntry.lostQty = inventoryRow.lostQty;
  stockEntry.reorderLevel = Math.max(0, asNumber(inventoryRow.reorderLevel, stockEntry.reorderLevel));

  await inventoryRow.save();
  await variant.save();
}

export async function reserveStockEntry(operation) {
  const { inventoryRow, variant, stockEntry } = await loadInventoryRow(operation);
  const availableQty = getAvailableQuantity(inventoryRow);
  if (availableQty < operation.quantity) {
    throw createHttpError("Inventory changed before checkout could complete", 409);
  }

  inventoryRow.availableQty = availableQty - operation.quantity;
  inventoryRow.quantity = inventoryRow.availableQty;
  inventoryRow.reservedQty = getReservedQuantity(inventoryRow) + operation.quantity;

  await saveInventoryRow({ inventoryRow, variant, stockEntry });
}

export async function releaseReservedStockEntry(operation) {
  const { inventoryRow, variant, stockEntry } = await loadInventoryRow(operation);
  const reservedQty = getReservedQuantity(inventoryRow);
  if (reservedQty < operation.quantity) {
    throw createHttpError("Reserved stock is lower than the requested release quantity", 409);
  }

  inventoryRow.availableQty = getAvailableQuantity(inventoryRow) + operation.quantity;
  inventoryRow.quantity = inventoryRow.availableQty;
  inventoryRow.reservedQty = reservedQty - operation.quantity;

  await saveInventoryRow({ inventoryRow, variant, stockEntry });
}

export async function shipReservedStockEntry(operation) {
  const { inventoryRow, variant, stockEntry } = await loadInventoryRow(operation);
  const reservedQty = getReservedQuantity(inventoryRow);
  if (reservedQty < operation.quantity) {
    throw createHttpError("Reserved stock is lower than the shipment quantity", 409);
  }

  inventoryRow.reservedQty = reservedQty - operation.quantity;
  await saveInventoryRow({ inventoryRow, variant, stockEntry });
}

export async function restockCancelledStockEntry(operation) {
  const { inventoryRow, variant, stockEntry } = await loadInventoryRow(operation);
  const reservedQty = getReservedQuantity(inventoryRow);
  if (reservedQty < operation.quantity) {
    throw createHttpError("Reserved stock is lower than the restock quantity", 409);
  }

  inventoryRow.availableQty = getAvailableQuantity(inventoryRow) + operation.quantity;
  inventoryRow.quantity = inventoryRow.availableQty;
  inventoryRow.reservedQty = reservedQty - operation.quantity;

  await saveInventoryRow({ inventoryRow, variant, stockEntry });
}

export async function markCancelledStockDamaged(operation) {
  const { inventoryRow, variant, stockEntry } = await loadInventoryRow(operation);
  const reservedQty = getReservedQuantity(inventoryRow);
  if (reservedQty < operation.quantity) {
    throw createHttpError("Reserved stock is lower than the damaged quantity", 409);
  }

  inventoryRow.reservedQty = reservedQty - operation.quantity;
  inventoryRow.damagedQty = getDamagedQuantity(inventoryRow) + operation.quantity;

  await saveInventoryRow({ inventoryRow, variant, stockEntry });
}

export async function markCancelledStockLost(operation) {
  const { inventoryRow, variant, stockEntry } = await loadInventoryRow(operation);
  const reservedQty = getReservedQuantity(inventoryRow);
  if (reservedQty < operation.quantity) {
    throw createHttpError("Reserved stock is lower than the lost quantity", 409);
  }

  inventoryRow.reservedQty = reservedQty - operation.quantity;
  inventoryRow.lostQty = getLostQuantity(inventoryRow) + operation.quantity;

  await saveInventoryRow({ inventoryRow, variant, stockEntry });
}

export async function decrementStockEntry(operation) {
  await reserveStockEntry(operation);
}

export async function incrementStockEntry(operation) {
  await releaseReservedStockEntry(operation);
}
