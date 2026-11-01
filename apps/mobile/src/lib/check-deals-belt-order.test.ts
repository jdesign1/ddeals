import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHECK_DEALS_BELT_ORDER,
  normalizeCheckDealsBeltOrder,
} from "./check-deals-belt-order.ts";

test("normalizes a saved group order and appends missing groups", () => {
  assert.deepEqual(
    normalizeCheckDealsBeltOrder(["for-you", "for-you", "top-deals"]),
    ["for-you", "top-deals"],
  );
});

test("migrates the previous three-belt order into the two supported groups", () => {
  assert.deepEqual(
    normalizeCheckDealsBeltOrder(["top-savers", "dodgiest-deals", "for-you"]),
    ["top-deals", "for-you"],
  );
  assert.deepEqual(
    normalizeCheckDealsBeltOrder(["for-you", "top-savers", "dodgiest-deals"]),
    ["for-you", "top-deals"],
  );
});

test("falls back to the default order for invalid saved data", () => {
  assert.deepEqual(normalizeCheckDealsBeltOrder(null), [...DEFAULT_CHECK_DEALS_BELT_ORDER]);
  assert.deepEqual(normalizeCheckDealsBeltOrder(["unknown", 4]), [...DEFAULT_CHECK_DEALS_BELT_ORDER]);
});
