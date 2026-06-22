import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import StorefrontCartRead from "./customer-orders.storefront-cart.model.js";
import StorefrontCategoryRead from "./customer-orders.storefront-category.model.js";
import StorefrontInventoryRead from "./customer-orders.storefront-inventory.model.js";
import StorefrontProductRead from "./customer-orders.storefront-product.model.js";
import StorefrontVariantRead from "./customer-orders.storefront-variant.model.js";
import { prepareCustomerOrderFromCart } from "./customer-orders.service.js";

function createId(seed) {
  return new mongoose.Types.ObjectId(seed).toString();
}

function createQueryResult(value) {
  return {
    select() {
      return this;
    },
    lean: async () => value,
  };
}

function createCart({ cartToken, productId, variantId, stockKey, quantity = 1 }) {
  return {
    cartToken,
    items: [{
      _id: createId("665f45f70f00000000002010"),
      productId,
      productSlug: "rose-saree",
      productTitle: "Rose Saree",
      variantId,
      stockKey,
      sizeLabel: "38",
      colorName: "Pink",
      imageUrl: "https://example.com/rose-saree.jpg",
      unitPrice: 1000,
      effectivePrice: 800,
      quantity,
      available: true,
      taxRate: 0.05,
      priceIncludesTax: true,
    }],
  };
}

function createVariant({ productId, variantId, stockKey, quantity }) {
  return {
    _id: variantId,
    productId,
    price: 1000,
    discount: { type: "flat", value: 200, label: "Festive Offer" },
    taxRate: 0.05,
    images: [{ url: "https://example.com/rose-saree.jpg", sortOrder: 0 }],
    colors: [{ name: "Pink", hex: "#f7a8c6" }],
    stock: [{
      stockKey,
      sizeLabel: "38",
      quantity,
    }],
    isActive: true,
  };
}

function createInventoryRow({ productId, variantId, stockKey, quantity }) {
  return {
    productId,
    variantId,
    stockKey,
    sizeLabel: "38",
    quantity,
  };
}

test("prepareCustomerOrderFromCart prefers canonical inventory when variant projection is stale low", async () => {
  const originals = {
    cartFindOne: StorefrontCartRead.findOne,
    productFindOne: StorefrontProductRead.findOne,
    variantFindOne: StorefrontVariantRead.findOne,
    inventoryFindOne: StorefrontInventoryRead.findOne,
    categoryFindById: StorefrontCategoryRead.findById,
  };

  const cartToken = "cart-prefer-inventory";
  const productId = createId("665f45f70f00000000002001");
  const variantId = createId("665f45f70f00000000002002");
  const categoryId = createId("665f45f70f00000000002003");
  const stockKey = "STK-PREFER-1";

  StorefrontCartRead.findOne = async () => createCart({ cartToken, productId, variantId, stockKey });
  StorefrontProductRead.findOne = () => createQueryResult({
    _id: productId,
    title: "Rose Saree",
    slug: "rose-saree",
    images: [{ url: "https://example.com/rose-saree.jpg", sortOrder: 0 }],
    isActive: true,
    categoryId,
  });
  StorefrontVariantRead.findOne = () => createQueryResult(createVariant({
    productId,
    variantId,
    stockKey,
    quantity: 0,
  }));
  StorefrontInventoryRead.findOne = () => createQueryResult(createInventoryRow({
    productId,
    variantId,
    stockKey,
    quantity: 2,
  }));
  StorefrontCategoryRead.findById = () => createQueryResult({ _id: categoryId, slug: "sarees" });

  try {
    const payload = await prepareCustomerOrderFromCart({ cartToken });
    assert.equal(payload.prepared.stockOperations.length, 1);
    assert.equal(payload.prepared.stockOperations[0].stockKey, stockKey);
    assert.equal(payload.prepared.items[0].stockKey, stockKey);
    assert.equal(payload.prepared.items[0].quantity, 1);
  } finally {
    StorefrontCartRead.findOne = originals.cartFindOne;
    StorefrontProductRead.findOne = originals.productFindOne;
    StorefrontVariantRead.findOne = originals.variantFindOne;
    StorefrontInventoryRead.findOne = originals.inventoryFindOne;
    StorefrontCategoryRead.findById = originals.categoryFindById;
  }
});

test("prepareCustomerOrderFromCart rejects stale high variant projection when canonical inventory is depleted", async () => {
  const originals = {
    cartFindOne: StorefrontCartRead.findOne,
    productFindOne: StorefrontProductRead.findOne,
    variantFindOne: StorefrontVariantRead.findOne,
    inventoryFindOne: StorefrontInventoryRead.findOne,
    categoryFindById: StorefrontCategoryRead.findById,
  };

  const cartToken = "cart-reject-stale-variant";
  const productId = createId("665f45f70f00000000002004");
  const variantId = createId("665f45f70f00000000002005");
  const categoryId = createId("665f45f70f00000000002006");
  const stockKey = "STK-PREFER-2";

  StorefrontCartRead.findOne = async () => createCart({ cartToken, productId, variantId, stockKey });
  StorefrontProductRead.findOne = () => createQueryResult({
    _id: productId,
    title: "Blue Saree",
    slug: "blue-saree",
    images: [{ url: "https://example.com/blue-saree.jpg", sortOrder: 0 }],
    isActive: true,
    categoryId,
  });
  StorefrontVariantRead.findOne = () => createQueryResult(createVariant({
    productId,
    variantId,
    stockKey,
    quantity: 3,
  }));
  StorefrontInventoryRead.findOne = () => createQueryResult(createInventoryRow({
    productId,
    variantId,
    stockKey,
    quantity: 0,
  }));
  StorefrontCategoryRead.findById = () => createQueryResult({ _id: categoryId, slug: "sarees" });

  try {
    await assert.rejects(
      () => prepareCustomerOrderFromCart({ cartToken }),
      /Cart quantity exceeds current stock/
    );
  } finally {
    StorefrontCartRead.findOne = originals.cartFindOne;
    StorefrontProductRead.findOne = originals.productFindOne;
    StorefrontVariantRead.findOne = originals.variantFindOne;
    StorefrontInventoryRead.findOne = originals.inventoryFindOne;
    StorefrontCategoryRead.findById = originals.categoryFindById;
  }
});

test("prepareCustomerOrderFromCart falls back to variant projection when inventory row is missing", async () => {
  const originals = {
    cartFindOne: StorefrontCartRead.findOne,
    productFindOne: StorefrontProductRead.findOne,
    variantFindOne: StorefrontVariantRead.findOne,
    inventoryFindOne: StorefrontInventoryRead.findOne,
    categoryFindById: StorefrontCategoryRead.findById,
  };

  const cartToken = "cart-fallback-variant";
  const productId = createId("665f45f70f00000000002007");
  const variantId = createId("665f45f70f00000000002008");
  const categoryId = createId("665f45f70f00000000002009");
  const stockKey = "STK-PREFER-3";

  StorefrontCartRead.findOne = async () => createCart({ cartToken, productId, variantId, stockKey });
  StorefrontProductRead.findOne = () => createQueryResult({
    _id: productId,
    title: "Green Saree",
    slug: "green-saree",
    images: [{ url: "https://example.com/green-saree.jpg", sortOrder: 0 }],
    isActive: true,
    categoryId,
  });
  StorefrontVariantRead.findOne = () => createQueryResult(createVariant({
    productId,
    variantId,
    stockKey,
    quantity: 2,
  }));
  StorefrontInventoryRead.findOne = () => createQueryResult(null);
  StorefrontCategoryRead.findById = () => createQueryResult({ _id: categoryId, slug: "sarees" });

  try {
    const payload = await prepareCustomerOrderFromCart({ cartToken });
    assert.equal(payload.prepared.stockOperations.length, 1);
    assert.equal(payload.prepared.items[0].quantity, 1);
    assert.equal(payload.prepared.items[0].stockKey, stockKey);
  } finally {
    StorefrontCartRead.findOne = originals.cartFindOne;
    StorefrontProductRead.findOne = originals.productFindOne;
    StorefrontVariantRead.findOne = originals.variantFindOne;
    StorefrontInventoryRead.findOne = originals.inventoryFindOne;
    StorefrontCategoryRead.findById = originals.categoryFindById;
  }
});
