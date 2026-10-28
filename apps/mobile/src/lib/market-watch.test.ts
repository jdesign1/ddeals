import assert from "node:assert/strict";
import test from "node:test";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import { buildMarketWatchStats } from "./market-watch.ts";

const NOW = Date.parse("2026-10-28T12:00:00.000Z");

function deal(overrides: Partial<CurrentDeal>): CurrentDeal {
  return {
    store: "New World",
    price: 5,
    originalPrice: 6,
    discountPercentage: 17,
    dealType: "Fair Price",
    wasArtificiallyInflated: false,
    reason: "Fair special",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: null,
    specialEndDate: null,
    ninetyDayLow: 5,
    ninetyDayHigh: 7,
    ninetyDayAvg: 6,
    ninetyDaySamples: 10,
    ninetyDaySpecialSamples: 3,
    ninetyDayDaysTracked: 90,
    ninetyDaySpecialDays: 20,
    ...overrides,
  };
}

function product(category: string, currentDeals: CurrentDeal[]): ProductCard {
  return {
    id: `${category}-${currentDeals.length}`,
    brand: "Test brand",
    name: "Test product",
    category,
    image: "",
    standardPrice: 6,
    unit: "each",
    currentDeals,
    priceHistory: [],
    description: "",
  };
}

test("Market Watch excludes unverified offers and counts market facts at offer level", () => {
  const stats = buildMarketWatchStats([
    product("Household & Cleaning", [
      deal({ dealType: "Real Deal", price: 5, ninetyDayLow: 5, scrapedAt: "2026-10-28T11:30:00.000Z" }),
      deal({ store: "Woolworths", dealType: "Fair Price" }),
      deal({ store: "PAK'nSAVE", dealType: "Unverified Deal" }),
    ]),
    product("Pantry", [
      deal({ dealType: "Dodgy Deal", saleStartedAt: "2026-10-25T12:00:00.000Z" }),
    ]),
  ], NOW);

  assert.equal(stats.assessedOffers, 3);
  assert.equal(stats.realSavers, 1);
  assert.equal(stats.fairDeals, 1);
  assert.equal(stats.dodgyDeals, 1);
  assert.equal(stats.realSaversAtNinetyDayLow, 1);
  assert.equal(stats.realSaversAtNinetyDayLowPercentage, 100);
  assert.equal(stats.recentlyStartedDodgyDeals, 1);
  assert.equal(stats.updatedAt, "2026-10-28T11:30:00.000Z");
});

test("Market Watch uses the shared shopper category normalisation", () => {
  const realDeals = Array.from({ length: 20 }, () => deal({ dealType: "Real Deal" }));
  const stats = buildMarketWatchStats([
    product("Fridge, Deli & Eggs > Milk > Fresh Milk", realDeals),
  ], NOW);

  assert.deepEqual(stats.topCategories, [{
    category: "Dairy & Eggs",
    real: 20,
    fair: 0,
    dodgy: 0,
    assessed: 20,
    realPercentage: 100,
    fairPercentage: 0,
    dodgyPercentage: 0,
    summary: "20 of 20 assessed specials are Real Savers",
  }]);
});
