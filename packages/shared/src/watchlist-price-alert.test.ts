import assert from "node:assert/strict";
import test from "node:test";
import {
  detectWatchlistPriceAlert,
  isWatchlistObservationFresh,
  WATCHLIST_MIN_PERCENT_DROP,
  WATCHLIST_MIN_PRICE_DROP,
} from "./watchlist-price-alert.ts";

const state = {
  last_price: 10,
  last_is_special: true,
  last_verdict: "GENUINE" as const,
  last_notified_price: null,
};

test("does not alert on the first observation", () => {
  assert.equal(detectWatchlistPriceAlert({
    previous: undefined,
    previousIsFresh: false,
    currentPrice: 8,
    isVerifiedSpecial: true,
    verdict: "GENUINE",
  }), null);
});

test("alerts when a special price becomes meaningfully cheaper", () => {
  assert.equal(detectWatchlistPriceAlert({
    previous: state,
    previousIsFresh: true,
    currentPrice: 9.25,
    isVerifiedSpecial: true,
    verdict: "GENUINE",
  }), "better_special_price");
});

test("alerts when a watched special becomes a Real Saver without a price drop", () => {
  assert.equal(detectWatchlistPriceAlert({
    previous: { ...state, last_verdict: "MARGINAL" },
    previousIsFresh: true,
    currentPrice: 10,
    isVerifiedSpecial: true,
    verdict: "GENUINE",
  }), "became_real_saver");
});

test("alerts when a watched special turns Dodgy", () => {
  assert.equal(detectWatchlistPriceAlert({
    previous: { ...state, last_verdict: "GENUINE" },
    previousIsFresh: true,
    currentPrice: 10,
    isVerifiedSpecial: true,
    verdict: "DODGY",
  }), "became_dodgy");
});

test("does not repeatedly alert for an unchanged verdict", () => {
  assert.equal(detectWatchlistPriceAlert({
    previous: { ...state, last_verdict: "GENUINE" },
    previousIsFresh: true,
    currentPrice: 10,
    isVerifiedSpecial: true,
    verdict: "GENUINE",
  }), null);
});

test("establishes a verdict baseline for pre-migration state rows", () => {
  assert.equal(detectWatchlistPriceAlert({
    previous: { ...state, last_verdict: null },
    previousIsFresh: true,
    currentPrice: 10,
    isVerifiedSpecial: true,
    verdict: "DODGY",
  }), null);
});

test("accepts a delayed scrape within the two-cycle freshness window", () => {
  const now = Date.parse("2026-10-04T00:00:00.000Z");
  assert.equal(isWatchlistObservationFresh("2026-09-28T00:00:00.000Z", now), true);
  assert.equal(isWatchlistObservationFresh("2026-09-25T23:59:59.999Z", now), false);
});

test("requires both the dollar and percentage thresholds", () => {
  assert.equal(detectWatchlistPriceAlert({
    previous: state,
    previousIsFresh: true,
    currentPrice: 10 - WATCHLIST_MIN_PRICE_DROP,
    isVerifiedSpecial: true,
    verdict: "GENUINE",
  }), null);
  assert.equal(detectWatchlistPriceAlert({
    previous: { ...state, last_price: 100 },
    previousIsFresh: true,
    currentPrice: 100 - WATCHLIST_MIN_PRICE_DROP,
    isVerifiedSpecial: true,
    verdict: "GENUINE",
  }), null);
});

test("alerts when a regular item returns to a verified special", () => {
  assert.equal(detectWatchlistPriceAlert({
    previous: { last_price: 10, last_is_special: false, last_notified_price: null },
    previousIsFresh: true,
    currentPrice: 8.5,
    isVerifiedSpecial: true,
    verdict: "MARGINAL",
  }), "returned_to_special");
});

test("never alerts for a dodgy special or stale baseline", () => {
  const input = {
    previous: { ...state, last_verdict: "DODGY" as const },
    currentPrice: 8,
    isVerifiedSpecial: true,
    verdict: "DODGY",
  };
  assert.equal(detectWatchlistPriceAlert({ ...input, previousIsFresh: true }), null);
  assert.equal(detectWatchlistPriceAlert({ ...input, previousIsFresh: false, verdict: "GENUINE" }), null);
});
