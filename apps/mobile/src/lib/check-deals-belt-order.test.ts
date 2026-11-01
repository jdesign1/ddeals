import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHECK_DEALS_BELT_ORDER,
  normalizeCheckDealsBeltOrder,
} from "./check-deals-belt-order.ts";

test("normalizes a saved order and appends missing belts", () => {
  assert.deepEqual(
    normalizeCheckDealsBeltOrder(["for-you", "for-you", "dodgiest-deals"]),
    ["for-you", "dodgiest-deals", "top-savers"],
  );
});

test("falls back to the default order for invalid saved data", () => {
  assert.deepEqual(normalizeCheckDealsBeltOrder(null), [...DEFAULT_CHECK_DEALS_BELT_ORDER]);
  assert.deepEqual(normalizeCheckDealsBeltOrder(["unknown", 4]), [...DEFAULT_CHECK_DEALS_BELT_ORDER]);
});
