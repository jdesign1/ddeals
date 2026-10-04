import assert from "node:assert/strict";
import test from "node:test";
import {
  detectWatchlistPriceAlert,
  isWatchlistObservationFresh,
  WATCHLIST_MIN_PRICE_DROP,
  WATCHLIST_MAX_OBSERVATION_AGE_MS,
} from "./watchlist-price-alert.ts";

const state = {
  last_price: 10,
  last_is_special: true,
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

test("keeps a baseline fresh across one weekly promotion cycle", () => {
  const now = Date.parse("2026-10-04T00:00:00.000Z");
  assert.equal(isWatchlistObservationFresh("2026-09-28T00:00:00.000Z", now), true);
  assert.equal(isWatchlistObservationFresh("2026-09-25T23:59:59.999Z", now), false);
  assert.equal(WATCHLIST_MAX_OBSERVATION_AGE_MS, 8 * 24 * 60 * 60 * 1000);
});

test("does not treat malformed or future observations as fresh", () => {
  const now = Date.parse("2026-10-04T00:00:00.000Z");
  assert.equal(isWatchlistObservationFresh("not-a-date", now), false);
  assert.equal(isWatchlistObservationFresh("2026-10-04T00:00:00.001Z", now), false);
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

test("alerts when a watched special becomes dodgy, but not from a stale baseline", () => {
  const input = {
    previous: state,
    currentPrice: 8,
    isVerifiedSpecial: true,
    verdict: "DODGY",
  };
  assert.equal(detectWatchlistPriceAlert({ ...input, previousIsFresh: true }), "dodgy_special");
  assert.equal(detectWatchlistPriceAlert({ ...input, previousIsFresh: false, verdict: "GENUINE" }), null);
});
