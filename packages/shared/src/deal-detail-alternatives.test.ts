import { test } from "node:test";
import assert from "node:assert/strict";
import { findCheaperAlternatives } from "./deal-detail.ts";
import type { CurrentDeal, ProductCard } from "./data.ts";

const TEST_NOW = Date.parse("2026-10-18T00:00:00Z");

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
    specialsVerifiedAt: "2026-10-17T00:00:00Z",
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
    unit: "1 each",
    currentDeals: [fakeDeal()],
    priceHistory: [],
    description: "",
    ...overrides,
  };
}

function findAlternatives(target: ProductCard, products: ProductCard[], price: number) {
  return findCheaperAlternatives(target, products, price, ["all"], undefined, { now: TEST_NOW });
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

  assert.deepEqual(findAlternatives(target, [target, ...randomHouseholdProducts], 5), []);
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

  const results = findAlternatives(target, [target, candidate], 5);
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

  assert.deepEqual(findAlternatives(target, [target, candidate], 5), []);
});

test("findCheaperAlternatives: compares compatible unit value instead of pack price", () => {
  const target = fakeProduct({
    id: "coffee",
    name: "Coffee Beans Medium Roast",
    category: "Pantry",
    unit: "1kg",
    currentDeals: [fakeDeal({ price: 5 })],
  });
  const candidate = fakeProduct({
    id: "smaller-coffee",
    name: "Coffee Beans Dark Roast",
    category: "Pantry",
    unit: "500g",
    currentDeals: [fakeDeal({ price: 2.4 })],
  });

  const results = findAlternatives(target, [target, candidate], 5);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.savingUnit, "kg");
  assert.equal(results[0]?.comparison, "unit-price");
  assert.equal(results[0]?.targetUnitPrice, 5);
  assert.equal(results[0]?.candidateUnitPrice, 4.8);
  assert.equal(results[0]?.saving, 0.2);
});

test("findCheaperAlternatives: rejects a cheaper pack with a worse unit value", () => {
  const target = fakeProduct({
    id: "rice",
    name: "Long Grain Rice",
    category: "Pantry",
    unit: "1kg",
    currentDeals: [fakeDeal({ price: 5 })],
  });
  const candidate = fakeProduct({
    id: "small-rice",
    name: "Long Grain Rice",
    category: "Pantry",
    unit: "500g",
    currentDeals: [fakeDeal({ price: 2.6 })],
  });

  assert.deepEqual(findAlternatives(target, [target, candidate], 5), []);
});

test("findCheaperAlternatives: normalizes retailer comparative labels", () => {
  const target = fakeProduct({
    id: "flour",
    name: "Plain Flour",
    category: "Pantry",
    unit: "1kg",
    currentDeals: [fakeDeal({ price: 5, saleUnitPrice: 5, saleUnitLabel: "$/kg" })],
  });
  const candidate = fakeProduct({
    id: "small-flour",
    name: "Plain Flour Premium",
    category: "Pantry",
    unit: "500g",
    currentDeals: [fakeDeal({ price: 2.5, saleUnitPrice: 0.4, saleUnitLabel: "$/100g" })],
  });

  const results = findCheaperAlternatives(target, [target, candidate], 5, ["all"], undefined, {
    baselineDeal: target.currentDeals[0],
    now: TEST_NOW,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.savingUnit, "kg");
  assert.equal(results[0]?.candidateUnitPrice, 4);
});

test("findCheaperAlternatives: excludes stale, dodgy, and expired specials", () => {
  const target = fakeProduct({ id: "target", name: "Laundry Powder", category: "Household", unit: "1kg" });
  const candidates = [
    fakeProduct({
      id: "stale",
      name: "Laundry Powder Sensitive",
      category: "Household",
      unit: "1kg",
      currentDeals: [fakeDeal({ specialsVerifiedAt: "2026-10-01T00:00:00Z", price: 2 })],
    }),
    fakeProduct({
      id: "dodgy",
      name: "Laundry Powder Value",
      category: "Household",
      unit: "1kg",
      currentDeals: [fakeDeal({ dealType: "Dodgy Deal", wasArtificiallyInflated: true, price: 2 })],
    }),
    fakeProduct({
      id: "expired",
      name: "Laundry Powder Fresh",
      category: "Household",
      unit: "1kg",
      currentDeals: [fakeDeal({ specialEndDate: "2026-10-17", price: 2 })],
    }),
    fakeProduct({
      id: "review",
      name: "Laundry Powder Gentle",
      category: "Household",
      unit: "1kg",
      currentDeals: [fakeDeal({ isDodgyReviewCandidate: true, price: 2 })],
    }),
  ];

  assert.deepEqual(findAlternatives(target, [target, ...candidates], 5), []);
});

test("findCheaperAlternatives: excludes explicit variant mismatches", () => {
  const target = fakeProduct({
    id: "milk",
    name: "Plant Based Oat Milk",
    category: "Dairy & Eggs",
    unit: "1L",
  });
  const candidate = fakeProduct({
    id: "dairy-milk",
    name: "Standard Dairy Milk",
    category: "Dairy & Eggs",
    unit: "1L",
    currentDeals: [fakeDeal({ price: 2 })],
  });

  assert.deepEqual(findAlternatives(target, [target, candidate], 5), []);
});

test("findCheaperAlternatives: deterministic ordering survives reversed product order", () => {
  const target = fakeProduct({ id: "target", name: "Long Grain Rice", category: "Pantry", unit: "1kg" });
  const first = fakeProduct({ id: "candidate-a", name: "Long Grain Rice Value", category: "Pantry", unit: "1kg", currentDeals: [fakeDeal({ price: 3 })] });
  const second = fakeProduct({ id: "candidate-b", name: "Long Grain Rice Premium", category: "Pantry", unit: "1kg", currentDeals: [fakeDeal({ price: 3 })] });

  const forward = findAlternatives(target, [target, first, second], 5).map(({ product }) => product.id);
  const reversed = findAlternatives(target, [target, second, first], 5).map(({ product }) => product.id);
  assert.deepEqual(forward, ["candidate-a", "candidate-b"]);
  assert.deepEqual(reversed, forward);
});
