import crypto from "node:crypto";
import mongoose from "mongoose";
import Cart from "./cart.model.js";
import Product from "../product/product.model.js";
import Variant from "../variant/variant.model.js";

const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function createCartToken() {
  return `cart_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildExpiry() {
  return new Date(Date.now() + GUEST_CART_TTL_MS);
}

function calculateDiscountedPrice(price, discount) {
  const base = Math.max(0, Number(price || 0));
  const type = String(discount?.type || "none").trim().toLowerCase();
  const value = Math.max(0, Number(discount?.value || 0));

  if (type === "percent") {
    return Math.max(0, base - (base * Math.min(100, value)) / 100);
  }
  if (type === "flat") {
    return Math.max(0, base - value);
  }
  return base;
}

function normalizeCartToken(value) {
  return normalizeString(value).replace(/[^a-zA-Z0-9_-]+/g, "");
}

function getRequestedCartToken(req) {
  return normalizeCartToken(req.query.cartToken || req.body?.cartToken || req.headers["x-cart-token"]);
}

async function loadLiveSelection({ productId, variantId, stockKey }) {
  const [product, variant] = await Promise.all([
    Product.findById(productId)
      .select("_id slug title isActive")
      .lean(),
    Variant.findOne({ _id: variantId, productId })
      .select("_id productId price discount images colors stock isActive")
      .lean(),
  ]);

  if (!product) {
    const err = new Error("Product not found");
    err.statusCode = 404;
    throw err;
  }
  if (!variant || !variant.isActive) {
    const err = new Error("Variant not found");
    err.statusCode = 404;
    throw err;
  }

  const normalizedStockKey = normalizeString(stockKey).toUpperCase();
  const stockRow = (Array.isArray(variant.stock) ? variant.stock : []).find(
    (row) => normalizeString(row?.stockKey).toUpperCase() === normalizedStockKey
  );

  if (!stockRow) {
    const err = new Error("Selected size is not available");
    err.statusCode = 400;
    throw err;
  }

  return { product, variant, stockRow };
}

function buildCartLineSnapshot({ product, variant, stockRow, quantity }) {
  return {
    productId: product._id,
    productSlug: normalizeString(product.slug),
    productTitle: normalizeString(product.title),
    variantId: variant._id,
    stockKey: normalizeString(stockRow.stockKey).toUpperCase(),
    sizeLabel: normalizeString(stockRow.sizeLabel),
    colorName: normalizeString(variant?.colors?.[0]?.name),
    imageUrl: normalizeString(variant?.images?.[0]?.url),
    unitPrice: Math.max(0, asNumber(variant.price, 0)),
    effectivePrice: calculateDiscountedPrice(variant.price, variant.discount),
    quantity: Math.max(0, Math.floor(asNumber(quantity, 1))),
    available: Number(stockRow?.quantity || 0) > 0,
  };
}

async function touchCart(cart) {
  cart.lastSeenAt = new Date();
  cart.expiresAt = buildExpiry();
  await cart.save();
}

async function ensureCart(cartToken = "") {
  const normalizedToken = normalizeCartToken(cartToken);
  let cart = normalizedToken
    ? await Cart.findOne({ cartToken: normalizedToken })
    : null;

  if (cart && cart.expiresAt && cart.expiresAt.getTime() <= Date.now()) {
    await Cart.deleteOne({ _id: cart._id });
    cart = null;
  }

  if (!cart) {
    cart = await Cart.create({
      cartToken: createCartToken(),
      items: [],
      lastSeenAt: new Date(),
      expiresAt: buildExpiry(),
    });
    return cart;
  }

  await touchCart(cart);
  return cart;
}

async function hydrateCart(cart) {
  const warnings = [];
  let changed = false;

  for (const line of cart.items || []) {
    try {
      const { product, variant, stockRow } = await loadLiveSelection({
        productId: line.productId,
        variantId: line.variantId,
        stockKey: line.stockKey,
      });
      const availableQty = Math.max(0, asNumber(stockRow.quantity, 0));
      const nextQuantity = Math.min(Math.max(0, Math.floor(asNumber(line.quantity, 0))), availableQty);
      const snapshot = buildCartLineSnapshot({
        product,
        variant,
        stockRow,
        quantity: nextQuantity,
      });

      if (line.quantity !== snapshot.quantity || line.available !== snapshot.available) {
        changed = true;
        if (line.quantity > snapshot.quantity) {
          warnings.push({
            type: "stock_adjusted",
            itemId: String(line._id),
            message: `${snapshot.productTitle} quantity was adjusted based on current stock.`,
          });
        }
      }

      Object.assign(line, snapshot);
    } catch {
      changed = true;
      line.quantity = 0;
      line.available = false;
      warnings.push({
        type: "unavailable",
        itemId: String(line._id),
        message: `${line.productTitle || "Item"} is no longer available.`,
      });
    }
  }

  if (changed) {
    await touchCart(cart);
  }

  const items = (cart.items || []).map((line) => ({
    itemId: String(line._id),
    productId: String(line.productId),
    productSlug: normalizeString(line.productSlug),
    productTitle: normalizeString(line.productTitle),
    variantId: String(line.variantId),
    stockKey: normalizeString(line.stockKey).toUpperCase(),
    sizeLabel: normalizeString(line.sizeLabel),
    colorName: normalizeString(line.colorName),
    imageUrl: normalizeString(line.imageUrl),
    unitPrice: Math.max(0, asNumber(line.unitPrice, 0)),
    effectivePrice: Math.max(0, asNumber(line.effectivePrice, 0)),
    quantity: Math.max(0, Math.floor(asNumber(line.quantity, 0))),
    available: !!line.available,
    lineTotal: Math.max(0, asNumber(line.effectivePrice, 0)) * Math.max(0, Math.floor(asNumber(line.quantity, 0))),
  }));

  return {
    cartToken: cart.cartToken,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
    items,
    expiresAt: cart.expiresAt,
    warnings,
  };
}

export async function getCart(req, res) {
  try {
    const cart = await ensureCart(getRequestedCartToken(req));
    const payload = await hydrateCart(cart);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load cart" });
  }
}

export async function addCartItem(req, res) {
  try {
    const { productId, variantId, stockKey } = req.body || {};
    const quantity = Math.max(1, Math.floor(asNumber(req.body?.quantity, 1)));

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "productId must be a valid ObjectId" });
    }
    if (!mongoose.isValidObjectId(variantId)) {
      return res.status(400).json({ error: "variantId must be a valid ObjectId" });
    }
    if (!normalizeString(stockKey)) {
      return res.status(400).json({ error: "stockKey is required" });
    }

    const cart = await ensureCart(getRequestedCartToken(req));
    const { product, variant, stockRow } = await loadLiveSelection({ productId, variantId, stockKey });
    const availableQty = Math.max(0, asNumber(stockRow.quantity, 0));

    if (availableQty < 1) {
      return res.status(409).json({ error: "Selected size is out of stock" });
    }

    const normalizedStockKey = normalizeString(stockKey).toUpperCase();
    const existingLine = (cart.items || []).find(
      (line) =>
        String(line.productId) === String(productId) &&
        String(line.variantId) === String(variantId) &&
        normalizeString(line.stockKey).toUpperCase() === normalizedStockKey
    );

    const nextQuantity = existingLine
      ? Math.min(availableQty, Math.max(1, asNumber(existingLine.quantity, 0)) + quantity)
      : Math.min(availableQty, quantity);

    if (existingLine) {
      Object.assign(existingLine, buildCartLineSnapshot({
        product,
        variant,
        stockRow,
        quantity: nextQuantity,
      }));
    } else {
      cart.items.push(buildCartLineSnapshot({
        product,
        variant,
        stockRow,
        quantity: nextQuantity,
      }));
    }

    await touchCart(cart);
    const payload = await hydrateCart(cart);
    return res.status(201).json(payload);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message || "Failed to add item to cart" });
  }
}

export async function updateCartItem(req, res) {
  try {
    const itemId = normalizeString(req.params.itemId);
    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({ error: "itemId must be a valid ObjectId" });
    }

    const cart = await ensureCart(getRequestedCartToken(req));
    const line = (cart.items || []).find((item) => String(item._id) === itemId);
    if (!line) return res.status(404).json({ error: "Cart item not found" });

    const requestedQuantity = Math.max(0, Math.floor(asNumber(req.body?.quantity, 0)));
    if (requestedQuantity === 0) {
      cart.items = (cart.items || []).filter((item) => String(item._id) !== itemId);
      await touchCart(cart);
      const payload = await hydrateCart(cart);
      return res.json(payload);
    }

    const { product, variant, stockRow } = await loadLiveSelection({
      productId: line.productId,
      variantId: line.variantId,
      stockKey: line.stockKey,
    });
    const availableQty = Math.max(0, asNumber(stockRow.quantity, 0));
    if (availableQty < 1) {
      return res.status(409).json({ error: "Selected size is out of stock" });
    }

    Object.assign(line, buildCartLineSnapshot({
      product,
      variant,
      stockRow,
      quantity: Math.min(availableQty, requestedQuantity),
    }));

    await touchCart(cart);
    const payload = await hydrateCart(cart);
    return res.json(payload);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message || "Failed to update cart item" });
  }
}

export async function removeCartItem(req, res) {
  try {
    const itemId = normalizeString(req.params.itemId);
    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({ error: "itemId must be a valid ObjectId" });
    }

    const cart = await ensureCart(getRequestedCartToken(req));
    const nextItems = (cart.items || []).filter((item) => String(item._id) !== itemId);
    if (nextItems.length === (cart.items || []).length) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    cart.items = nextItems;
    await touchCart(cart);
    const payload = await hydrateCart(cart);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to remove cart item" });
  }
}
