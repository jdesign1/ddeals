import assert from "node:assert/strict";
import { test } from "node:test";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import {
  createNewSpecialsPending,
  createNewSpecialsSnapshot,
  getNewSpecialDealKey,
  getNewSpecialsStorageScope,
  isNewSpecialsPendingActive,
  removeReviewedNewSpecials,
  summarizeNewSpecials,
} from "./new-specials.ts";

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

test("a price increase does not create a new-specials update", () => {
  const previous = createNewSpecialsSnapshot([product("p1", [deal({ price: 5 })])]);
  const refreshed = [product("p1", [deal({ price: 6 })])];

  const summary = summarizeNewSpecials(refreshed, previous);

  assert.equal(summary.total, 0);
});

test("filling in a missing sale start timestamp does not create a false new-specials update", () => {
  const previous = createNewSpecialsSnapshot([product("p1", [deal({ saleStartedAt: null })])]);
  const refreshed = [product("p1", [deal({ saleStartedAt: "2026-09-29T00:00:00.000Z" })])];

  const summary = summarizeNewSpecials(refreshed, previous);

  assert.equal(summary.total, 0);
  assert.equal(summary.newlyStarted, 0);
  assert.equal(summary.priceDrops, 0);
});

test("all new deals are counted and account scopes stay separate", () => {
  const products = Array.from({ length: 5 }, (_, index) => product(`p${index}`, [deal({ price: 4 - index / 10 })]));
  const previous = createNewSpecialsSnapshot([]);
  const summary = summarizeNewSpecials(products, previous);

  assert.equal(summary.total, 5);
  assert.equal(getNewSpecialsStorageScope("user-1"), "user:user-1");
  assert.equal(getNewSpecialsStorageScope("user-1", true), "device");
  assert.equal(getNewSpecialsStorageScope(null), "device");
});

test("new batches keep the popup state separate from the unread deal state", () => {
  const now = Date.parse("2026-10-01T00:00:00.000Z");
  const snapshot = createNewSpecialsSnapshot([]);
  const summary = summarizeNewSpecials([product("p1", [deal()])], snapshot);
  const pending = createNewSpecialsPending(summary, createNewSpecialsSnapshot([product("p1", [deal()])]), now);

  assert.equal(pending.popupPresented, false);
  assert.equal(pending.detectedAt, now);
  assert.equal(isNewSpecialsPendingActive(pending, now + 1), true);
  assert.equal(isNewSpecialsPendingActive(pending, pending.expiresAt), false);
});

test("reviewing one deal category preserves the other unread keys", () => {
  const previous = createNewSpecialsSnapshot([]);
  const products = [
    product("real", [deal({ dealType: "Real Deal" })]),
    product("dodgy", [deal({ dealType: "Dodgy Deal", store: "newworld", saleStartedAt: "2026-09-29T00:00:00.000Z" })]),
    product("fair", [deal({ dealType: "Fair Price", store: "paknsave", saleStartedAt: "2026-09-29T00:00:00.000Z" })]),
  ];
  const summary = summarizeNewSpecials(products, previous);
  const remaining = removeReviewedNewSpecials(summary, summary.realDealKeys);

  assert.ok(remaining);
  assert.equal(remaining.total, 2);
  assert.equal(remaining.realDeals, 0);
  assert.equal(remaining.dodgyDeals, 1);
  assert.equal(remaining.priceDrops, 0);
});
