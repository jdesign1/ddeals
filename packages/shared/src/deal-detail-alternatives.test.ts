import { test } from "node:test";
import assert from "node:assert/strict";
import { findCheaperAlternatives } from "./deal-detail.ts";
import type { CurrentDeal, ProductCard } from "./data.ts";

function fakeDeal(overrides: Partial<CurrentDeal> = {}): CurrentDeal {
  return {
    store: "Woolworths",
    price: 4,
    originalPrice: 6,
    discountPercentage: 33,
    dealType: "Real Deal",
    wasArtificiallyInflated: false,
    reason: "Genuine Sale",
    explanation: "Saving 33% vs recent normal price",
    isOnSpecial: true,
    saleStartedAt: null,
    specialEndDate: null,
    productUrl: null,
    ninetyDayLow: null,
    ninetyDayHigh: null,
    ninetyDayAvg: null,
    ninetyDaySamples: null,
    ninetyDaySpecialSamples: null,
    ninetyDayDaysTracked: null,
    ninetyDaySpecialDays: null,
    ...overrides,
  };
}

function fakeProduct(overrides: Partial<ProductCard> = {}): ProductCard {
  return {
    id: "product-1",
    brand: "Test brand",
    name: "Test product",
    category: "Household",
    image: "",
    standardPrice: 10,
    unit: "",
    currentDeals: [fakeDeal()],
    priceHistory: [],
    description: "",
    ...overrides,
  };
}

test("findCheaperAlternatives: does not turn broad Household into random options", () => {
  const target = fakeProduct({
    id: "cake-pan",
    name: "Chelsea Winter Cake Pan Non Stick Springform 24cm Tin",
  });
  const randomHouseholdProducts = [
    fakeProduct({ id: "dishwashing", name: "Apple Plant Based Formula Dishwashing Liquid" }),
    fakeProduct({ id: "soap", name: "Ecostore Lemongrass Soap" }),
    fakeProduct({ id: "wrap", name: "Glad Wrap Plastic Cling Wrap Refill" }),
    fakeProduct({ id: "air-freshener", name: "Glade Clean Linen Air Freshener" }),
  ];

  assert.deepEqual(findCheaperAlternatives(target, [target, ...randomHouseholdProducts], 5), []);
});

test("findCheaperAlternatives: keeps a cheaper product with the same product type", () => {
  const target = fakeProduct({
    id: "cake-pan",
    name: "Chelsea Winter Cake Pan Non Stick Springform 24cm Tin",
  });
  const candidate = fakeProduct({
    id: "baking-tray",
    name: "Pams Springform Cake Tin 24cm",
    currentDeals: [fakeDeal({ store: "PAK'nSAVE", price: 3.99 })],
  });

  const results = findCheaperAlternatives(target, [target, candidate], 5);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.product.id, "baking-tray");
});

test("findCheaperAlternatives: blocks known incompatible product types", () => {
  const target = fakeProduct({ id: "air-freshener", name: "Glade Clean Linen Air Freshener" });
  const candidate = fakeProduct({
    id: "dishwashing",
    name: "Pams Dishwashing Liquid",
    currentDeals: [fakeDeal({ price: 1.99 })],
  });

  assert.deepEqual(findCheaperAlternatives(target, [target, candidate], 5), []);
});
