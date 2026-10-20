import assert from "node:assert/strict";
import { test } from "node:test";
import { getLockedWatchlistProductIds, shouldShowWatchlistUpgradePrompt } from "./watchlist-upgrade.ts";

test("free accounts lock only saved products beyond the first five", () => {
  const items = Array.from({ length: 6 }, (_, index) => ({
    productId: `product-${index + 1}`,
    addedAt: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  assert.deepEqual([...getLockedWatchlistProductIds(items, false)], ["product-6"]);
  assert.deepEqual([...getLockedWatchlistProductIds(items, true)], []);
});

test("the Watchlist upgrade prompt appears every fifth visit only after the free allowance", () => {
  assert.equal(shouldShowWatchlistUpgradePrompt(5, 5, false), false);
  assert.equal(shouldShowWatchlistUpgradePrompt(6, 4, false), false);
  assert.equal(shouldShowWatchlistUpgradePrompt(6, 5, false), true);
  assert.equal(shouldShowWatchlistUpgradePrompt(6, 10, false), true);
  assert.equal(shouldShowWatchlistUpgradePrompt(6, 5, true), false);
});
