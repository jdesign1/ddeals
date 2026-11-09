import assert from "node:assert/strict";
import test from "node:test";
import type { UnreadListAlert } from "./notifications-context.tsx";
import { collapseWatchlistUpdates, getWatchlistPriceChange, getWatchlistUpdateCopy } from "./watchlist-update-copy.ts";

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
    previous_verdict: "GENUINE",
    price: 7.99,
    previous_price: 8.99,
    created_at: "2026-10-28T00:00:00.000Z",
    ...overrides,
  };
}

test("watchlist update copy explains a price drop simply", () => {
  assert.deepEqual(getWatchlistUpdateCopy(update()), {
    title: "Price dropped",
    description: "Was $8.99, now dropped to $7.99.",
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

test("watchlist update copy explains any price direction", () => {
  assert.deepEqual(getWatchlistUpdateCopy(update({ event_type: "price_changed", price: 9.99, previous_price: 8.99 })), {
    title: "Price increased",
    description: "Was $8.99, now increased to $9.99.",
    toneClass: "text-alert-700",
  });
});

test("watchlist price changes expose direction and both prices for the sheet", () => {
  assert.deepEqual(getWatchlistPriceChange(update()), {
    direction: "down",
    currentPrice: "$7.99",
    previousPrice: "$8.99",
  });
  assert.equal(getWatchlistPriceChange(update({ price: 9.99, previous_price: 8.99 })).direction, "up");
});

test("watchlist update copy explains all verdict transitions", () => {
  assert.deepEqual(getWatchlistUpdateCopy(update({
    event_type: "verdict_changed",
    previous_verdict: "GENUINE",
    verdict: "MARGINAL",
    previous_price: 7.99,
  })), {
    title: "Deal verdict changed",
    description: "Real Deal → Fair Price at New World.",
    toneClass: "text-stone-700",
  });
});

test("collapses duplicate supermarket updates and keeps price direction", () => {
  const updates = collapseWatchlistUpdates([
    update({
      id: "verdict",
      event_type: "verdict_changed",
      previous_price: 8.99,
      price: 8.99,
      created_at: "2026-10-28T00:05:00.000Z",
    }),
    update({
      id: "increase",
      event_type: "price_changed",
      previous_price: 8.99,
      price: 9.99,
      created_at: "2026-10-28T00:04:00.000Z",
    }),
    update({
      id: "woolworths-drop",
      store_name: "Woolworths",
      event_type: "price_changed",
      previous_price: 9.99,
      price: 8.99,
      created_at: "2026-10-28T00:03:00.000Z",
    }),
  ]);

  assert.deepEqual(updates.map((item) => item.id), ["increase", "woolworths-drop"]);
  assert.equal(getWatchlistUpdateCopy(updates[0]!).title, "Price increased");
  assert.equal(getWatchlistUpdateCopy(updates[1]!).title, "Price dropped");
});
