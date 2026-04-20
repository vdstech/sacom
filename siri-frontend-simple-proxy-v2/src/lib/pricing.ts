import type { StoreDiscount } from "@/lib/storeApi";

type PriceInput = {
  price?: number;
  effectivePrice?: number;
  discount?: StoreDiscount | null;
};

function asMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function roundPercent(value: number) {
  return Math.max(0, Math.round(value));
}

export function formatMoney(value: unknown) {
  return `₹${asMoney(value)}`;
}

export function getPriceDisplay(input?: PriceInput | null) {
  const price = asMoney(input?.price);
  const effectivePrice = asMoney(input?.effectivePrice || price);
  const safeDiscount = input?.discount || null;

  let percentOff = 0;
  if (safeDiscount?.type === "percent") {
    percentOff = roundPercent(Number(safeDiscount.value || 0));
  } else if (price > 0 && effectivePrice > 0 && effectivePrice < price) {
    percentOff = roundPercent(((price - effectivePrice) / price) * 100);
  }

  const hasDiscount = price > 0 && effectivePrice > 0 && effectivePrice < price && percentOff > 0;

  return {
    finalPrice: effectivePrice || price,
    originalPrice: price,
    hasDiscount,
    percentOff,
  };
}
