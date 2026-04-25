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

export async function decrementStockEntry(operation) {
  const inventoryResult = await StorefrontInventoryRead.updateOne(
    {
      stockKey: operation.stockKey,
      productId: operation.productId,
      variantId: operation.variantId,
      quantity: { $gte: operation.quantity },
    },
    {
      $inc: { quantity: -operation.quantity },
    }
  );

  if (!inventoryResult?.matchedCount) {
    throw createHttpError("Inventory changed before checkout could complete", 409);
  }

  const variantResult = await StorefrontVariantRead.updateOne(
    {
      _id: operation.variantId,
      productId: operation.productId,
      stock: {
        $elemMatch: {
          stockKey: operation.stockKey,
          quantity: { $gte: operation.quantity },
        },
      },
    },
    {
      $inc: { "stock.$[entry].quantity": -operation.quantity },
    },
    {
      arrayFilters: [{ "entry.stockKey": operation.stockKey }],
    }
  );

  if (!variantResult?.matchedCount) {
    await StorefrontInventoryRead.updateOne(
      {
        stockKey: operation.stockKey,
        productId: operation.productId,
        variantId: operation.variantId,
      },
      { $inc: { quantity: operation.quantity } }
    );
    throw createHttpError("Inventory changed before checkout could complete", 409);
  }
}

export async function incrementStockEntry(operation) {
  const inventoryResult = await StorefrontInventoryRead.updateOne(
    {
      stockKey: operation.stockKey,
      productId: operation.productId,
      variantId: operation.variantId,
    },
    {
      $inc: { quantity: operation.quantity },
    }
  );

  if (!inventoryResult?.matchedCount) {
    throw createHttpError("Unable to restore inventory for this order", 500);
  }

  const variantResult = await StorefrontVariantRead.updateOne(
    {
      _id: operation.variantId,
      productId: operation.productId,
      stock: {
        $elemMatch: {
          stockKey: operation.stockKey,
        },
      },
    },
    {
      $inc: { "stock.$[entry].quantity": operation.quantity },
    },
    {
      arrayFilters: [{ "entry.stockKey": operation.stockKey }],
    }
  );

  if (!variantResult?.matchedCount) {
    await StorefrontInventoryRead.updateOne(
      {
        stockKey: operation.stockKey,
        productId: operation.productId,
        variantId: operation.variantId,
      },
      { $inc: { quantity: -operation.quantity } }
    );
    throw createHttpError("Unable to restore variant stock for this order", 500);
  }
}
