import assert from "node:assert/strict";
import test from "node:test";
import type { ProductCard } from "@dodgey-deals/shared";
import {
  brandMatchesProduct,
  buildBrandSummaries,
  findBrandSuggestion,
  normalizeBrandDisplayName,
  normalizeBrandKey,
} from "./brand-browse.ts";

function product(
  id: string,
  brand: string,
  store: string | string[],
  dealType: "Real Deal" | "Fair Price" | "Dodgy Deal" = "Real Deal",
  image = `/images/${id}.jpg`,
): ProductCard {
  return {
    id,
    brand,
    name: `${brand} product`,
    category: "Pantry",
    image,
    standardPrice: 5,
    unit: "each",
    currentDeals: (Array.isArray(store) ? store : [store]).map((storeName) => ({
      store: storeName,
      price: 3,
      originalPrice: 5,
      discountPercentage: 40,
      dealType,
      wasArtificiallyInflated: dealType === "Dodgy Deal",
      reason: "Test",
      explanation: null,
      isOnSpecial: true,
      saleStartedAt: null,
      specialEndDate: null,
      ninetyDayLow: null,
      ninetyDayHigh: null,
      ninetyDayAvg: null,
      ninetyDaySamples: null,
      ninetyDaySpecialSamples: null,
      ninetyDayDaysTracked: null,
      ninetyDaySpecialDays: null,
    })),
    priceHistory: [],
    description: "",
  };
}

test("normalizes punctuation and accents into one brand key", () => {
  assert.equal(normalizeBrandKey("PAM’S & Café"), "pams and cafe");
});

test("normalizes possessive brand display names", () => {
  assert.equal(normalizeBrandDisplayName("Griffin'S"), "Griffins");
  assert.equal(normalizeBrandDisplayName("Griffin’s"), "Griffins");
});

test("counts unique products and separates Real Saver counts", () => {
  const brands = buildBrandSummaries([
    product("anchor-1", "Anchor", ["New World", "Woolworths NZ"]),
    product("anchor-2", "ANCHOR", "Woolworths", "Fair Price"),
    product("pams-1", "PAM'S", "PAK'nSAVE", "Dodgy Deal"),
  ]);

  assert.deepEqual(brands.map(({ name, currentSpecialCount, realSaverCount, supermarketCount }) => ({
    name,
    currentSpecialCount,
    realSaverCount,
    supermarketCount,
  })), [
    { name: "Anchor", currentSpecialCount: 2, realSaverCount: 1, supermarketCount: 2 },
    { name: "PAMs", currentSpecialCount: 1, realSaverCount: 0, supermarketCount: 1 },
  ]);
});

test("respects the selected supermarket and excludes unusable brands", () => {
  const brands = buildBrandSummaries([
    product("anchor-1", "Anchor", "New World"),
    product("anchor-2", "Anchor", "Woolworths"),
    product("unknown-1", "Unbranded", "New World"),
  ], ["woolworths"]);

  assert.deepEqual(brands.map(({ key, currentSpecialCount }) => ({ key, currentSpecialCount })), [
    { key: "anchor", currentSpecialCount: 1 },
  ]);
});

test("suggests a brand for exact and longer queries", () => {
  const brands = buildBrandSummaries([
    product("anchor-1", "Anchor", "New World"),
    product("anchor-2", "Anchor", "Woolworths"),
  ]);

  assert.equal(findBrandSuggestion("Anchor", brands)?.key, "anchor");
  assert.equal(findBrandSuggestion("Anchor milk", brands)?.key, "anchor");
  assert.equal(brandMatchesProduct(product("anchor-1", "ANCHOR", "New World"), "anchor"), true);
});
