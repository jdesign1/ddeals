import assert from "node:assert/strict";
import test from "node:test";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import type { DealCheckRow } from "@dodgey-deals/shared";
import {
  buildCurrentSpecialCounts,
  buildNewSinceLastVisitDeals,
  buildPersonalisedCategoryDealRails,
  buildPreviouslyCheckedChangedDeals,
  buildWatchlistSpecialDeals,
  formatCompactUpdatedText,
  getPreviouslyCheckedDealKey,
} from "./check-deals-home.ts";

function deal(overrides: Partial<CurrentDeal> = {}): CurrentDeal {
  return {
    store: "New World",
    price: 8,
    originalPrice: 10,
    discountPercentage: 20,
    dealType: "Real Deal",
    wasArtificiallyInflated: false,
    reason: "",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: "2026-10-15T10:00:00.000Z",
    specialEndDate: null,
    scrapedAt: "2026-10-16T00:00:00.000Z",
    specialsVerifiedAt: "2026-10-16T00:00:00.000Z",
    ninetyDayLow: null,
    ninetyDayHigh: null,
    ninetyDayAvg: null,
    ninetyDaySamples: null,
    ninetyDaySpecialSamples: null,
    ninetyDayDaysTracked: null,
    ninetyDaySpecialDays: null,
    ...overrides,
  };
}

function product(id: string, name: string, currentDeals: CurrentDeal[], category = "Pantry"): ProductCard {
  return {
    id,
    brand: "Test brand",
    name,
    category,
    image: "",
    standardPrice: 10,
    unit: "1 each",
    currentDeals,
    priceHistory: [],
    description: "",
  };
}

test("summary counts are unique active products per supermarket", () => {
  const products = [
    product("1", "One", [deal()]),
    product("2", "Two", [deal({ store: "New World NZ" }), deal({ store: "PAK'nSAVE" })]),
    product("3", "Three", [deal({ store: "Woolworths", isOnSpecial: false })]),
  ];

  assert.deepEqual(buildCurrentSpecialCounts(products), { newworld: 2, paknsave: 1, woolworths: 0 });
});

test("compact freshness text stays short and omits ago", () => {
  const now = Date.parse("2026-10-16T01:00:00.000Z");
  assert.equal(formatCompactUpdatedText("2026-10-16T00:48:00.000Z", now), "12 min");
  assert.equal(formatCompactUpdatedText("2026-10-15T22:00:00.000Z", now), "3 hr");
  assert.equal(formatCompactUpdatedText("2026-10-16T00:59:40.000Z", now), "now");
  assert.equal(formatCompactUpdatedText("not-a-date", now), null);
});

test("new since last visit honours the semantic deal keys and store filter", () => {
  const products = [
    product("1", "New item", [deal({ store: "New World" })]),
    product("2", "Other item", [deal({ store: "Woolworths" })]),
  ];
  const keys = ["1::newworld", "2::woolworths"];

  assert.deepEqual(
    buildNewSinceLastVisitDeals(products, keys, ["newworld"]).map(({ product: item }) => item.id),
    ["1"],
  );
});

test("personalised category belts group before limiting and show one card per product", () => {
  const pantryProducts = Array.from({ length: 20 }, (_, index) =>
    product(`pantry-${index}`, `Pantry ${index}`, [deal({ store: "New World" })]),
  );
  const drinkProducts = [
    product("drink-1", "Drink one", [deal({ store: "New World" })], "Drinks"),
    product("drink-2", "Drink two", [deal({ store: "New World" }), deal({ store: "Woolworths", price: 7 })], "Drinks"),
  ];
  const products = [...pantryProducts, ...drinkProducts];
  const keys = products.flatMap((item) => item.currentDeals.map((currentDeal) => {
    const storeKey = currentDeal.store.toLowerCase().replace(/[^a-z]/g, "");
    return `${item.id}::${storeKey}`;
  }));

  const rails = buildPersonalisedCategoryDealRails(products, keys, ["all"], ["Pantry", "Drinks"]);

  assert.equal(rails.length, 2);
  assert.deepEqual(rails.map((rail) => rail.category), ["Pantry", "Drinks"]);
  assert.equal(rails[0]?.deals.length, 10);
  assert.equal(rails[1]?.deals.length, 2);
  assert.equal(rails[1]?.dealKeys.length, 3);
  assert.equal(new Set(rails[1]?.deals.map((item) => item.product.id)).size, 2);
});

test("personalised category belts skip a category with fewer than two products", () => {
  const rails = buildPersonalisedCategoryDealRails(
    [product("one", "One", [deal({ store: "New World" })], "Frozen")],
    ["one::newworld"],
    ["all"],
    ["Frozen"],
  );

  assert.deepEqual(rails, []);
});

test("watchlist belt only includes saved active specials and picks the strongest offer", () => {
  const products = [
    product("1", "Saved", [deal({ store: "New World", price: 8 }), deal({ store: "Woolworths", price: 7, originalPrice: 10 })]),
    product("2", "Not saved", [deal()]),
    product("3", "Inactive", [deal({ isOnSpecial: false })]),
  ];

  const items = buildWatchlistSpecialDeals(products, new Set(["1", "3"]), ["all"]);
  assert.deepEqual(items.map(({ product: item }) => item.id), ["1"]);
  assert.equal(items[0]?.deal.store, "Woolworths");
});

test("previously checked belt shows the latest changed check only", () => {
  const products = [product("1", "Changed", [deal({ price: 7 })])];
  const rows: DealCheckRow[] = [
    {
      id: "new",
      user_id: "user",
      product_id: "1",
      store: "New World",
      price: 8,
      original_price: 10,
      deal_type: "Real Deal",
      checked_at: "2026-10-16T00:00:00.000Z",
    },
    {
      id: "old",
      user_id: "user",
      product_id: "1",
      store: "New World",
      price: 9,
      original_price: 10,
      deal_type: "Fair Price",
      checked_at: "2026-10-15T00:00:00.000Z",
    },
  ];

  const items = buildPreviouslyCheckedChangedDeals(products, rows, ["all"]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.checkedAt, "2026-10-16T00:00:00.000Z");
  assert.equal(items[0]?.changeLabel, "Price changed since you checked");
});

test("previously checked dismissal keys change when the observed reminder changes", () => {
  const products = [product("1", "Changed", [deal({ price: 7 })])];
  const rows: DealCheckRow[] = [{
    id: "check",
    user_id: "user",
    product_id: "1",
    store: "New World",
    price: 8,
    original_price: 10,
    deal_type: "Real Deal",
    checked_at: "2026-10-16T00:00:00.000Z",
  }];
  const item = buildPreviouslyCheckedChangedDeals(products, rows, ["all"])[0];

  assert.ok(item);
  assert.equal(getPreviouslyCheckedDealKey(item), getPreviouslyCheckedDealKey({ ...item }));
  assert.notEqual(
    getPreviouslyCheckedDealKey(item),
    getPreviouslyCheckedDealKey({ ...item, deal: { ...item.deal, price: 6.5 } }),
  );
});
