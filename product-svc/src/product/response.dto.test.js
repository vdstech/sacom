import test from "node:test";
import assert from "node:assert/strict";
import {
  mapAdminProductDetail,
  mapAdminVariantListItem,
  mapStorefrontListItem,
  mapStorefrontProductDetail,
} from "./response.dto.js";

test("mapAdminProductDetail returns canonical product fields", () => {
  const mapped = mapAdminProductDetail({
    _id: "p1",
    title: "Title",
    slug: "slug",
    description: "desc",
    shortDescription: "short",
    categoryId: "c1",
    currency: "INR",
    tags: ["a"],
    images: [{ url: "https://img", alt: "alt", sortOrder: 0 }],
    shipping: {
      text: "Ships in 2-3 days",
    },
    care: { text: "Dry clean only" },
    returnPolicy: { text: "Returns and exchanges accepted within 7 days", returnable: true, windowDays: 7 },
    details: { sleeve_type: "long", padded: true, size_cm: 36 },
    __v: 9,
    createdBy: "u1",
    updatedBy: "u2",
    isFeatured: false,
    isActive: true,
  });

  assert.equal(mapped._id, "p1");
  assert.equal(mapped.categoryId, "c1");
  assert.deepEqual(mapped.tags, ["a"]);
  assert.equal(mapped.shipping?.text, "Ships in 2-3 days");
  assert.equal(mapped.care?.text, "Dry clean only");
  assert.equal(mapped.returnPolicy?.text, "Returns and exchanges accepted within 7 days");
  assert.equal(mapped.returnPolicy?.returnable, true);
  assert.equal(mapped.returnPolicy?.windowDays, 7);
  assert.equal(mapped.details?.sleeve_type, "long");
  assert.equal(mapped.details?.padded, true);
  assert.equal(mapped.details?.size_cm, 36);
  assert.ok(!Object.hasOwn(mapped, "__v"));
  assert.ok(!Object.hasOwn(mapped, "createdBy"));
  assert.ok(!Object.hasOwn(mapped, "updatedBy"));
});

test("mapAdminVariantListItem returns minimal variant fields", () => {
  const mapped = mapAdminVariantListItem({
    _id: "v1",
    productId: "p1",
    price: 100,
    discount: { type: "percent", value: 10, label: "Off" },
    images: [{ url: "https://img" }],
    colors: [{ name: "gold", hex: "#D4AF37" }, { name: "beige" }],
    details: { fabric: "silk", reversible: true },
    stock: [
      { stockKey: "STK-1", sizeLabel: "36", quantity: 10, reorderLevel: 2 },
      { stockKey: "STK-2", sizeLabel: "38", quantity: 5, reorderLevel: 1 },
    ],
    isDefault: true,
    isActive: true,
    __v: 0,
  });

  assert.equal(mapped._id, "v1");
  assert.equal(mapped.productId, "p1");
  assert.equal(mapped.colors.length, 2);
  assert.equal(mapped.colors[0].name, "gold");
  assert.equal(mapped.sizeLabel, "");
  assert.equal(mapped.details.fabric, "silk");
  assert.equal(mapped.stock.length, 2);
  assert.equal(mapped.stock[0].sizeLabel, "36");
  assert.equal(mapped.stock[0].quantity, 10);
  assert.ok(!Object.hasOwn(mapped, "__v"));
  assert.ok(!Object.hasOwn(mapped, "merchandise"));
  assert.ok(!Object.hasOwn(mapped, "sizeRows"));
});

test("mapStorefrontProductDetail returns storefront-safe product and variant data", () => {
  const mapped = mapStorefrontProductDetail(
    {
      _id: "p1",
      title: "P",
      slug: "p",
      description: "desc",
      shortDescription: "short",
      currency: "INR",
      images: [{ url: "https://img" }],
      shipping: { text: "Free shipping above 999" },
      care: { text: "Dry clean only" },
      returnPolicy: { text: "Returns and exchanges accepted within 7 days", returnable: true, windowDays: 7 },
      details: { sleeve_type: "long" },
    },
    {
      variants: [
        {
          variant: {
            _id: "v1",
            price: 100,
            isDefault: true,
            isActive: true,
            colors: [{ name: "gold" }, { name: "beige" }],
            details: { weave: "jacquard" },
            stock: [{ stockKey: "STK-1", sizeLabel: "L", quantity: 1, reorderLevel: 0 }],
            images: [{ url: "https://img" }],
          },
          computed: {
            effectivePrice: 90,
            stock: [{ stockKey: "STK-1", sizeLabel: "L", quantity: 1, reorderLevel: 0 }],
            availability: true,
          },
        },
      ],
      defaultVariant: { variantId: "v1", price: 100, effectivePrice: 90, colors: [{ name: "gold" }], sizeLabel: "L" },
      availability: true,
      colorSummary: { colorNames: ["gold"], swatches: [{ name: "gold" }], hasMultipleColors: false },
      otherVariantColors: [],
    }
  );

  assert.equal(mapped._id, "p1");
  assert.equal(mapped.shipping?.text, "Free shipping above 999");
  assert.equal(mapped.care?.text, "Dry clean only");
  assert.equal(mapped.returnPolicy?.text, "Returns and exchanges accepted within 7 days");
  assert.equal(mapped.returnPolicy?.returnable, true);
  assert.equal(mapped.returnPolicy?.windowDays, 7);
  assert.equal(mapped.variants.length, 1);
  assert.equal(mapped.variants[0].colors[0]?.name, "gold");
  assert.equal(mapped.variants[0].details.weave, "jacquard");
  assert.equal(mapped.variants[0].stock.length, 1);
  assert.equal(mapped.variants[0].stock[0].sizeLabel, "L");
  assert.ok(!Object.hasOwn(mapped.variants[0], "merchandise"));
  assert.ok(!Object.hasOwn(mapped.variants[0], "sizeRows"));
});

test("mapStorefrontListItem keeps the product category slug on mixed storefront rails", () => {
  const mapped = mapStorefrontListItem(
    {
      _id: "p2",
      title: "Featured blouse",
      slug: "featured-blouse",
      categoryId: "c2",
      shortDescription: "short",
      currency: "INR",
    },
    {
      categorySlug: "blouse",
      defaultVariant: { variantId: "v2", price: 1200, effectivePrice: 999 },
      availability: true,
    }
  );

  assert.equal(mapped.categoryId, "c2");
  assert.equal(mapped.categorySlug, "blouse");
});

test("product DTOs collapse legacy shipping, care, and return fields into text", () => {
  const mapped = mapAdminProductDetail({
    shipping: {
      dispatchWindow: "Ships in 1-2 business days",
      deliveryEta: "Delivery in 4-6 days",
      shippingChargeText: "Free shipping above 999",
      note: "Remote areas may take longer",
    },
    care: {
      washCare: ["Dry clean only"],
      ironCare: "Steam lightly",
      bleach: "Do not bleach",
      dryClean: "Recommended",
      dryInstructions: "Dry in shade",
    },
    returnPolicy: { returnable: true, windowDays: 7, type: "exchange_or_refund", notes: "Unused items only" },
  });

  assert.equal(
    mapped.shipping?.text,
    "Ships in 1-2 business days\nDelivery in 4-6 days\nFree shipping above 999\nRemote areas may take longer"
  );
  assert.equal(
    mapped.care?.text,
    "Dry clean only\nSteam lightly\nDo not bleach\nRecommended\nDry in shade"
  );
  assert.equal(
    mapped.returnPolicy?.text,
    "Return / exchange available\nReturn window: 7 days\nPolicy type: exchange_or_refund\nUnused items only"
  );
  assert.equal(mapped.returnPolicy?.returnable, true);
  assert.equal(mapped.returnPolicy?.windowDays, 7);
});
