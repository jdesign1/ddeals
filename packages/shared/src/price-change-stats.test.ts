import test from "node:test";
import assert from "node:assert/strict";
import type { CurrentDeal, ProductCard } from "./data.ts";
import { buildPriceChangeStats } from "./price-change-stats.ts";

function deal(store: string, samples: number | null, changes: number | null, price = 4): CurrentDeal {
  return {
    store,
    price,
    originalPrice: 5,
    discountPercentage: 20,
    dealType: "Real Deal",
    wasArtificiallyInflated: false,
    reason: "Real Deal",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: null,
    specialEndDate: null,
    ninetyDayLow: null,
    ninetyDayHigh: null,
    ninetyDayAvg: null,
    ninetyDaySamples: samples,
    ninetyDaySpecialSamples: null,
    ninetyDayPriceChanges: changes,
    ninetyDayDaysTracked: null,
    ninetyDaySpecialDays: null,
  };
}

function product(id: string, deals: CurrentDeal[]): ProductCard {
  return {
    id,
    brand: `Brand ${id}`,
    name: `Item ${id}`,
    category: "Food",
    image: "",
    standardPrice: 5,
    unit: "",
    currentDeals: deals,
    priceHistory: [],
    description: "",
  };
}

const stores = [
  { key: "woolworths", store: "Woolworths" },
  { key: "newworld", store: "New World" },
];

test("price change store comparisons show changed items and history coverage, not an average per item", () => {
  const stats = buildPriceChangeStats([
    product("one", [deal("Woolworths NZ", 5, 3)]),
    product("two", [deal("Woolworths", 4, 0)]),
    product("new", [deal("Woolworths", 1, 0)]), // one price state is not enough to count as tracked
    product("three", [deal("New World", 6, 2)]),
  ], stores);

  assert.deepEqual(stats.stores[0], {
    key: "newworld",
    store: "New World",
    totalChanges: 2,
    itemsTracked: 1,
    itemsChanged: 1,
    changeRatePct: 100,
  });
  assert.deepEqual(stats.stores[1], {
    key: "woolworths",
    store: "Woolworths",
    totalChanges: 3,
    itemsTracked: 2,
    itemsChanged: 1,
    changeRatePct: 50,
  });
});

test("top changed products sum distinct price changes across supermarkets and rank highest first", () => {
  const stats = buildPriceChangeStats([
    product("one", [deal("Woolworths", 5, 3), deal("New World", 4, 4)]),
    product("two", [deal("Woolworths", 6, 5)]),
    product("three", [deal("Woolworths", 2, 1)]),
  ], stores, 2);

  assert.deepEqual(stats.topProducts, [
    { id: "one", name: "Item one", brand: "Brand one", totalChanges: 7, storeCount: 2 },
    { id: "two", name: "Item two", brand: "Brand two", totalChanges: 5, storeCount: 1 },
  ]);
});

test("price changes do not treat special-status-only transitions as price changes", () => {
  const stats = buildPriceChangeStats([
    product("unchanged", [deal("Woolworths", 4, 0)]),
  ], stores);

  assert.equal(stats.stores[0].itemsTracked, 1);
  assert.equal(stats.stores[0].itemsChanged, 0);
  assert.deepEqual(stats.topProducts, []);
});
