import assert from "node:assert/strict";
import test from "node:test";
import type { ProductCard } from "@dodgey-deals/shared";
import { buildWatchlistStats } from "./watchlist-stats.ts";

function product(id: string, name: string, deals: ProductCard["currentDeals"]): ProductCard {
  return {
    id,
    brand: "Test brand",
    name,
    category: "Test",
    image: "",
    standardPrice: 10,
    unit: "each",
    currentDeals: deals,
    priceHistory: [],
    description: "",
  };
}

function deal(store: string, dealType: ProductCard["currentDeals"][number]["dealType"], price: number, originalPrice: number, specialDays: number, low: number, high: number) {
  return {
    store,
    price,
    originalPrice,
    discountPercentage: 10,
    dealType,
    wasArtificiallyInflated: false,
    reason: "test",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: null,
    specialEndDate: null,
    ninetyDayLow: low,
    ninetyDayHigh: high,
    ninetyDayAvg: (low + high) / 2,
    ninetyDaySamples: 10,
    ninetyDaySpecialSamples: 5,
    ninetyDayPriceChanges: 2,
    ninetyDayDaysTracked: 90,
    ninetyDaySpecialDays: specialDays,
  };
}

test("buildWatchlistStats only counts saved active specials and calculates per-store savings", () => {
  const saved = product("saved", "Saved item", [
    deal("New World", "Real Deal", 4, 7, 12, 4, 8),
    deal("Pak'nSave", "Fair Price", 5, 6, 4, 5, 7),
    deal("Woolworths", "Dodgy Deal", 8, 9, 2, 7, 10),
  ]);
  const unsaved = product("unsaved", "Unsaved item", [deal("New World", "Real Deal", 1, 3, 90, 1, 4)]);

  const stats = buildWatchlistStats([saved, unsaved], new Set(["saved"]));

  assert.deepEqual(stats.stores, [
    { key: "newworld", store: "New World", realSavers: 1, fairDeals: 0, dodgyDeals: 0 },
    { key: "paknsave", store: "Pak’n Save", realSavers: 0, fairDeals: 1, dodgyDeals: 0 },
    { key: "woolworths", store: "Woolworths", realSavers: 0, fairDeals: 0, dodgyDeals: 1 },
  ]);
  assert.deepEqual(stats.savings.map(({ amount }) => amount), [3, 1, 1]);
});

test("buildWatchlistStats ranks Watchlist Top 3 from 90-day history", () => {
  const often = product("often", "Often item", [deal("New World", "Real Deal", 4, 6, 20, 4, 7)]);
  const rarely = product("rarely", "Rarely item", [deal("New World", "Real Deal", 4, 6, 2, 4, 7)]);
  const swing = product("swing", "Swing item", [deal("New World", "Real Deal", 4, 6, 5, 2, 15)]);
  const stats = buildWatchlistStats([often, rarely, swing], new Set(["often", "rarely", "swing"]), "price-swings");

  assert.deepEqual(stats.topProducts.map(({ product: item }) => item.id), ["swing", "often", "rarely"]);
  assert.equal(stats.topProducts[0]?.totalPriceSwing, 13);
});
