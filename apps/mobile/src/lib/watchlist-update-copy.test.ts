import assert from "node:assert/strict";
import test from "node:test";
import type { UnreadListAlert } from "./notifications-context.tsx";
import { getWatchlistUpdateCopy } from "./watchlist-update-copy.ts";

function update(overrides: Partial<UnreadListAlert> = {}): UnreadListAlert {
  return {
    id: "update-1",
    list_id: "list-1",
    list_item_id: "item-1",
    product_id: "product-1",
    product_name: "Pumpkin",
    store_name: "New World",
    event_type: "better_special_price",
    verdict: "GENUINE",
    price: 7.99,
    previous_price: 8.99,
    created_at: "2026-10-28T00:00:00.000Z",
    ...overrides,
  };
}

test("watchlist update copy explains a price drop simply", () => {
  assert.deepEqual(getWatchlistUpdateCopy(update()), {
    title: "Price dropped",
    description: "$7.99 at New World. Down from $8.99.",
    toneClass: "text-fair-700",
  });
});

test("watchlist update copy explains verdict changes", () => {
  assert.deepEqual(getWatchlistUpdateCopy(update({ event_type: "became_dodgy", verdict: "DODGY", previous_price: null })), {
    title: "Now a Dodgy Deal",
    description: "$7.99 at New World.",
    toneClass: "text-alert-700",
  });
});
