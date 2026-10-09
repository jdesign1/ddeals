import { test } from "node:test";
import assert from "node:assert/strict";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import { sortWatchlistItems, watchlistItemDeal } from "./watchlist-sort.ts";

function deal(overrides: Partial<CurrentDeal>): CurrentDeal {
  return {
    store: "Woolworths",
    price: 5,
    originalPrice: 6,
    discountPercentage: 17,
    dealType: "Fair Price",
    wasArtificiallyInflated: false,
    reason: "Fair price",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: null,
    specialEndDate: null,
    scrapedAt: null,
    specialsVerifiedAt: null,
    ninetyDayLow: 4,
    ninetyDayHigh: 7,
    ninetyDayAvg: 5.5,
    ninetyDaySamples: 10,
    ninetyDaySpecialSamples: 3,
    ninetyDayPriceChanges: 1,
    ninetyDayDaysTracked: 30,
    ninetyDaySpecialDays: 10,
    regularPriceSamples: 8,
    regularHistoryDays: 30,
    evidenceStatus: "SUFFICIENT",
    evidenceStrength: "STRONG",
    storeHistoryReady: true,
    classifierVersion: "test",
    unitPriceSamples: null,
    unitPriceCoverageDays: null,
    unitPriceMaxSpanDays: null,
    saleUnitPrice: null,
    saleUnitLabel: null,
    assessmentBasis: "NINETY_DAY_LOW",
    isDodgyReviewCandidate: false,
    ...overrides,
  };
}

function product(id: string, currentDeals: CurrentDeal[]): ProductCard {
  return {
    id,
    brand: "Test",
    name: id,
    category: "Grocery",
    image: "",
    standardPrice: currentDeals[0]?.price ?? 0,
    unit: "",
    currentDeals,
    priceHistory: [],
    description: "",
  };
}

test("best Watchlist sorting prefers a Real Saver over a cheaper Fair Price", () => {
  const itemCards = new Map([
    ["real-saver", product("real-saver", [
      deal({ store: "PAK'nSAVE", price: 7, originalPrice: 10, discountPercentage: 30, dealType: "Real Deal" }),
      deal({ store: "Woolworths", price: 4, originalPrice: 5, discountPercentage: 20, dealType: "Fair Price" }),
    ])],
    ["fair-price", product("fair-price", [deal({ price: 3, originalPrice: 4, discountPercentage: 25 })])],
  ]);
  const items = [
    { productId: "fair-price", addedAt: "2026-10-10T00:00:00Z" },
    { productId: "real-saver", addedAt: "2026-10-09T00:00:00Z" },
  ];

  assert.equal(watchlistItemDeal(items[1], itemCards, ["all"])?.dealType, "Real Deal");
  assert.deepEqual(sortWatchlistItems(items, "best", itemCards, ["all"]).map((item) => item.productId), ["real-saver", "fair-price"]);
});

test("pulse-selected supermarket overrides the default best-offer choice", () => {
  const item = { productId: "milk", addedAt: "2026-10-10T00:00:00Z" };
  const itemCards = new Map([["milk", product("milk", [
    deal({ store: "PAK'nSAVE", price: 7, dealType: "Real Deal" }),
    deal({ store: "Woolworths", price: 5, dealType: "Fair Price" }),
  ])]]);

  assert.equal(watchlistItemDeal(item, itemCards, ["all"], "woolworths")?.store, "Woolworths");
});

test("pulse priority moves matching items first without removing the rest", () => {
  const itemCards = new Map([
    ["match", product("match", [deal({ price: 4 })])],
    ["other", product("other", [deal({ price: 6 })])],
  ]);
  const items = [
    { productId: "other", addedAt: "2026-10-10T00:00:00Z" },
    { productId: "match", addedAt: "2026-10-09T00:00:00Z" },
  ];

  assert.deepEqual(
    sortWatchlistItems(items, "best", itemCards, ["all"], undefined, new Set(["match"])).map((item) => item.productId),
    ["match", "other"],
  );
});
