import assert from "node:assert/strict";
import { test } from "node:test";
import { createWatchlistReturnContext } from "./watchlist-navigation.ts";

test("watchlist return state keeps the cheaper-options tab and a safe scroll offset", () => {
  assert.deepEqual(
    createWatchlistReturnContext("product-1", -4, 1_760_000_000_000),
    {
      version: 1,
      tab: "cheaper-options",
      expandedProductId: "product-1",
      scrollTop: 0,
      createdAt: 1_760_000_000_000,
    },
  );
});
