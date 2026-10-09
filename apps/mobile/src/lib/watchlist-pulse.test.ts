import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWatchlistPulse } from "./watchlist-pulse.ts";

test("counts verdicts and cheaper offers by unique Watchlist product", () => {
  const result = buildWatchlistPulse(
    [
      {
        productId: "milk",
        verdicts: ["Real Saver", "Fair Price"],
        offers: [
          { storeId: "paknsave", price: 6 },
          { storeId: "newworld", price: 5 },
        ],
      },
      {
        productId: "dodgy-cereal",
        verdicts: ["Dodgy Deal"],
        offers: [{ storeId: "woolworths", price: 8 }],
      },
    ],
    [],
  );

  assert.equal(result.counts["real-savers"], 1);
  assert.equal(result.counts["dodgy-deals"], 1);
  assert.equal(result.counts["cheaper-elsewhere"], 1);
  assert.deepEqual([...result.productIds["real-savers"]], ["milk"]);
});

test("deduplicates repeated unread events for the same product", () => {
  const result = buildWatchlistPulse(
    [{ productId: "coffee", verdicts: [], offers: [] }],
    [
      { productId: "coffee", eventType: "returned_to_special" },
      { productId: "coffee", eventType: "returned_to_special" },
      { productId: "coffee", eventType: "better_special_price" },
      { productId: "coffee", eventType: "better_special_price" },
    ],
  );

  assert.equal(result.counts["back-on-special"], 1);
  assert.equal(result.counts["price-drops"], 1);
});

test("ignores unread events for products no longer in the Watchlist", () => {
  const summary = buildWatchlistPulse(
    [{ productId: "kept", verdicts: [], offers: [] }],
    [{ productId: "removed", eventType: "better_special_price" }],
  );

  assert.equal(summary.counts["price-drops"], 0);
  assert.equal(summary.productIds["price-drops"].has("removed"), false);
});

test("does not create a cheaper-elsewhere signal for a single offer", () => {
  const result = buildWatchlistPulse(
    [{ productId: "bread", verdicts: ["Real Saver"], offers: [{ storeId: "newworld", price: 3 }] }],
    [],
  );

  assert.equal(result.counts["cheaper-elsewhere"], 0);
});

test("requires a lower offer at a different supermarket", () => {
  const result = buildWatchlistPulse(
    [{
      productId: "coffee",
      verdicts: [],
      offers: [
        { storeId: "paknsave", price: 6 },
        { storeId: "paknsave", price: 5 },
      ],
    }],
    [],
  );

  assert.equal(result.counts["cheaper-elsewhere"], 0);
});

test("keeps the supermarket that produced a verdict for pulse navigation", () => {
  const result = buildWatchlistPulse(
    [{
      productId: "milk",
      verdicts: ["Real Saver", "Fair Price"],
      verdictOffers: [
        { storeId: "paknsave", verdict: "Real Saver" },
        { storeId: "newworld", verdict: "Fair Price" },
      ],
      offers: [
        { storeId: "newworld", price: 5 },
        { storeId: "paknsave", price: 6 },
      ],
    }],
    [],
  );

  assert.equal(result.preferredStoreIds["real-savers"].get("milk"), "paknsave");
});
