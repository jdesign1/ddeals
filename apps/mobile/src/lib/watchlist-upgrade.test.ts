import assert from "node:assert/strict";
import { test } from "node:test";
import { getLockedWatchlistProductIds, getLockedWatchlistProductIdsFromRows, getUnlockedWatchlistProductIdsFromRows, shouldShowWatchlistUpgradePrompt } from "./watchlist-upgrade.ts";

test("free accounts keep the five most recently added products available", () => {
  const items = Array.from({ length: 6 }, (_, index) => ({
    productId: `product-${index + 1}`,
    addedAt: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  assert.deepEqual([...getLockedWatchlistProductIds(items, false)], ["product-1"]);
  assert.deepEqual([...getLockedWatchlistProductIds(items, true)], []);
});

test("free-account entitlement follows added dates rather than fetch order", () => {
  const items = [
    { productId: "product-6", addedAt: "2026-10-06T00:00:00.000Z" },
    { productId: "product-2", addedAt: "2026-10-02T00:00:00.000Z" },
    { productId: "product-7", addedAt: "2026-10-07T00:00:00.000Z" },
    { productId: "product-1", addedAt: "2026-10-01T00:00:00.000Z" },
    { productId: "product-5", addedAt: "2026-10-05T00:00:00.000Z" },
    { productId: "product-3", addedAt: "2026-10-03T00:00:00.000Z" },
    { productId: "product-4", addedAt: "2026-10-04T00:00:00.000Z" },
  ];

  assert.deepEqual([...getLockedWatchlistProductIds(items, false)], ["product-2", "product-1"]);
});

test("free-account entitlement uses a stable product tie-break for equal timestamps", () => {
  const items = Array.from({ length: 6 }, (_, index) => ({
    productId: `product-${index + 1}`,
    addedAt: "2026-10-01T00:00:00.000Z",
  }));

  assert.deepEqual([...getLockedWatchlistProductIds(items, false)], ["product-6"]);
});

test("free-account alert entitlement deduplicates products saved in multiple lists", () => {
  const rows = [
    { id: "item-1a", product_id: "product-1", added_at: "2026-10-01T00:00:00.000Z" },
    { id: "item-1b", product_id: "product-1", added_at: "2026-10-08T00:00:00.000Z" },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `item-${index + 2}`,
      product_id: `product-${index + 2}`,
      added_at: `2026-10-${String(index + 2).padStart(2, "0")}T00:00:00.000Z`,
    })),
  ];

  assert.deepEqual([...getLockedWatchlistProductIdsFromRows(rows, false)], ["product-2"]);
  assert.deepEqual([...getUnlockedWatchlistProductIdsFromRows(rows, false)], ["product-1", "product-3", "product-4", "product-5", "product-6"]);
});

test("the Watchlist upgrade prompt appears every fifth visit only after the free allowance", () => {
  assert.equal(shouldShowWatchlistUpgradePrompt(5, 5, false), false);
  assert.equal(shouldShowWatchlistUpgradePrompt(6, 4, false), false);
  assert.equal(shouldShowWatchlistUpgradePrompt(6, 5, false), true);
  assert.equal(shouldShowWatchlistUpgradePrompt(6, 10, false), true);
  assert.equal(shouldShowWatchlistUpgradePrompt(6, 5, true), false);
});
