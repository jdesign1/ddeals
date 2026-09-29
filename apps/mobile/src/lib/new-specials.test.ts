import assert from "node:assert/strict";
import { test } from "node:test";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import { createNewSpecialsSnapshot, getNewSpecialDealKey, summarizeNewSpecials } from "./new-specials.ts";

function deal(overrides: Partial<CurrentDeal> = {}): CurrentDeal {
  return {
    store: "woolworths",
    price: 5,
    originalPrice: 7,
    discountPercentage: 28.6,
    dealType: "Real Deal",
    wasArtificiallyInflated: false,
    reason: "Genuine sale",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: "2026-09-28T00:00:00.000Z",
    specialEndDate: null,
    scrapedAt: "2026-09-28T08:00:00.000Z",
    ninetyDayLow: 5,
    ninetyDayHigh: 7,
    ninetyDayAvg: 6,
    ninetyDaySamples: 12,
    ninetyDaySpecialSamples: 3,
    ninetyDayDaysTracked: 90,
    ninetyDaySpecialDays: 10,
    ...overrides,
  };
}

function product(id: string, currentDeals: CurrentDeal[]): ProductCard {
  return {
    id,
    brand: "Test brand",
    name: "Test product",
    category: "Pantry",
    image: "",
    standardPrice: 7,
    unit: "each",
    currentDeals,
    priceHistory: [],
    description: "",
  };
}

test("a CDN publication with only a newer scrape timestamp does not repeat old specials", () => {
  const previous = createNewSpecialsSnapshot([product("p1", [deal()])]);
  const refreshed = [product("p1", [deal({ scrapedAt: "2026-09-29T08:00:00.000Z" })])];

  const summary = summarizeNewSpecials(refreshed, previous);

  assert.equal(summary.total, 0);
  assert.equal(summary.newlyStarted, 0);
  assert.equal(summary.priceDrops, 0);
});

test("a new special and a lower price are surfaced with exact product-store keys", () => {
  const previous = createNewSpecialsSnapshot([product("p1", [deal()])]);
  const refreshed = [
    product("p1", [deal({ price: 4.5, scrapedAt: "2026-09-29T08:00:00.000Z" })]),
    product("p2", [deal({ store: "newworld", dealType: "Dodgy Deal", saleStartedAt: "2026-09-29T00:00:00.000Z" })]),
  ];

  const summary = summarizeNewSpecials(refreshed, previous);

  assert.equal(summary.total, 2);
  assert.equal(summary.newlyStarted, 1);
  assert.equal(summary.priceDrops, 1);
  assert.deepEqual(summary.allDealKeys.sort(), [
    getNewSpecialDealKey("p1", "woolworths"),
    getNewSpecialDealKey("p2", "newworld"),
  ]);
  assert.deepEqual(summary.realDealKeys, [getNewSpecialDealKey("p1", "woolworths")]);
  assert.deepEqual(summary.dodgyDealKeys, [getNewSpecialDealKey("p2", "newworld")]);
});
