import assert from "node:assert/strict";
import test from "node:test";
import {
  detectWatchlistAlerts,
  isWatchlistObservationFresh,
} from "./watchlist-price-alert.ts";

const state = {
  last_price: 10,
  last_is_special: true,
  last_verdict: "GENUINE" as const,
  last_notified_price: null,
};

test("does not alert on the first observation", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: undefined,
    previousIsFresh: false,
    currentIsFresh: true,
    currentPrice: 8,
    currentVerdict: "GENUINE",
  }), []);
});

test("alerts when any confirmed price changes", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: state,
    previousIsFresh: true,
    currentIsFresh: true,
    currentPrice: 9.25,
    currentVerdict: "GENUINE",
  }), ["price_changed"]);
});

test("alerts when a watched verdict changes without a price change", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: { ...state, last_verdict: "MARGINAL" },
    previousIsFresh: true,
    currentIsFresh: true,
    currentPrice: 10,
    currentVerdict: "GENUINE",
  }), ["verdict_changed"]);
});

test("alerts for every known verdict transition", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: { ...state, last_verdict: "GENUINE" },
    previousIsFresh: true,
    currentIsFresh: true,
    currentPrice: 10,
    currentVerdict: "MARGINAL",
  }), ["verdict_changed"]);
});

test("keeps simultaneous price and verdict changes as two signals", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: { ...state, last_verdict: "GENUINE" },
    previousIsFresh: true,
    currentIsFresh: true,
    currentPrice: 9,
    currentVerdict: "DODGY",
  }), ["price_changed", "verdict_changed"]);
});

test("does not repeatedly alert for unchanged price and verdict", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: { ...state, last_verdict: "GENUINE" },
    previousIsFresh: true,
    currentIsFresh: true,
    currentPrice: 10,
    currentVerdict: "GENUINE",
  }), []);
});

test("establishes a verdict baseline for pre-migration state rows", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: { ...state, last_verdict: null },
    previousIsFresh: true,
    currentIsFresh: true,
    currentPrice: 10,
    currentVerdict: "DODGY",
  }), []);
});

test("accepts a delayed scrape within the two-cycle freshness window", () => {
  const now = Date.parse("2026-10-04T00:00:00.000Z");
  assert.equal(isWatchlistObservationFresh("2026-09-28T00:00:00.000Z", now), true);
  assert.equal(isWatchlistObservationFresh("2026-09-25T23:59:59.999Z", now), false);
});

test("ignores sub-cent floating-point noise", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: state,
    previousIsFresh: true,
    currentIsFresh: true,
    currentPrice: 10.004,
    currentVerdict: "GENUINE",
  }), []);
});

test("alerts when a regular price changes", () => {
  assert.deepEqual(detectWatchlistAlerts({
    previous: { last_price: 10, last_is_special: false, last_notified_price: null },
    previousIsFresh: true,
    currentIsFresh: true,
    currentPrice: 8.5,
    currentVerdict: null,
  }), ["price_changed"]);
});

test("never alerts for a stale or invalid observation", () => {
  const input = {
    previous: { ...state },
    currentPrice: 8,
    currentVerdict: "DODGY" as const,
  };
  assert.deepEqual(detectWatchlistAlerts({ ...input, previousIsFresh: true, currentIsFresh: false }), []);
  assert.deepEqual(detectWatchlistAlerts({ ...input, previousIsFresh: false, currentIsFresh: true }), []);
  assert.deepEqual(detectWatchlistAlerts({ ...input, previousIsFresh: true, currentIsFresh: true, currentPrice: Number.NaN }), []);
});
