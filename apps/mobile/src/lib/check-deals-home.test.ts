import assert from "node:assert/strict";
import test from "node:test";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import type { DealCheckRow } from "@dodgey-deals/shared";
import {
  buildForYouCategoryDeals,
  buildForYouCategoryDealsByCategory,
  buildCurrentSpecialCounts,
  buildCurrentSpecialSummary,
  buildHomeDealBrowseSummary,
  buildHomePrimarySummary,
  buildNewSinceLastVisitDeals,
  buildPreviouslyCheckedChangedDeals,
  buildWatchlistSpecialDeals,
  formatCompactUpdatedText,
  getPreviouslyCheckedDealKey,
} from "./check-deals-home.ts";
import { getNewSpecialDealKey } from "./new-specials.ts";

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

test("current special summary shares counts and freshness from one catalogue", () => {
  const products = [
    product("active", "Active", [deal({ scrapedAt: "2026-10-16T00:00:00.000Z", specialsVerifiedAt: "2026-10-16T01:00:00.000Z" })]),
    product("inactive", "Inactive", [deal({ isOnSpecial: false, scrapedAt: "2026-10-16T02:00:00.000Z", specialsVerifiedAt: "2026-10-16T03:00:00.000Z" })]),
  ];

  assert.deepEqual(buildCurrentSpecialSummary(products), {
    counts: { newworld: 1, paknsave: 0, woolworths: 0 },
    latestPublishedAt: "2026-10-16T03:00:00.000Z",
  });
});

test("home primary summary keeps store-pill availability independent from active counts", () => {
  const products = [
    product("active", "Active", [deal({ store: "New World", isOnSpecial: true })]),
    product("inactive", "Inactive", [deal({ store: "Woolworths NZ", isOnSpecial: false })]),
    product("other", "Other", [deal({ store: "Chemist Warehouse", isOnSpecial: false })]),
  ];

  assert.deepEqual(buildHomePrimarySummary(products), {
    currentSpecialSummary: {
      counts: { newworld: 1, paknsave: 0, woolworths: 0 },
      latestPublishedAt: "2026-10-16T00:00:00.000Z",
    },
    availableStoreKeys: ["newworld", "woolworths", "chemistwarehouse"],
  });
});

test("combined Home browse summary keeps global counts and filtered deals together", () => {
  const products = [
    product("real", "Real item", [deal({ price: 7, originalPrice: 10 })], "Pantry"),
    product("fair", "Fair item", [deal({ dealType: "Fair Price", price: 8, originalPrice: 10 })], "Drinks"),
    product("dodgy", "Dodgy item", [deal({ store: "Woolworths NZ", dealType: "Dodgy Deal", price: 12, originalPrice: 10 })], "Pantry"),
    product("inactive", "Inactive item", [deal({ store: "PAK'nSAVE", isOnSpecial: false })], "Health & Body"),
  ];

  const result = buildHomeDealBrowseSummary(products, ["newworld"], "real");

  assert.deepEqual(result.deals.map(({ product: item }) => item.id), ["real"]);
  assert.deepEqual(result.availableCategories, ["Pantry"]);
  assert.deepEqual([...result.categoryCounts.entries()], [["Pantry", 1]]);
  assert.deepEqual(result.currentSpecialSummary.counts, { newworld: 2, paknsave: 0, woolworths: 1 });
  assert.deepEqual(result.availableStoreKeys, ["newworld", "paknsave", "woolworths"]);
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

test("new since last visit keeps the full-sort order when freshness is invalid", () => {
  const products = [
    product("invalid", "Zulu", [deal({ saleStartedAt: null, scrapedAt: null, specialsVerifiedAt: null })]),
    product("recent", "Alpha", [deal({ saleStartedAt: "2026-10-20T00:00:00.000Z" })]),
    product("older", "Beta", [deal({ saleStartedAt: "2026-10-19T00:00:00.000Z" })]),
  ];
  const keys = products.map((item) => getNewSpecialDealKey(item.id, "New World"));

  assert.deepEqual(
    buildNewSinceLastVisitDeals(products, keys, ["newworld"]).map(({ product: item }) => item.id),
    ["recent", "older", "invalid"],
  );
});

test("For you keeps the chosen category useful after the new-special batch is read", () => {
  const products = [
    product("fruit-1", "Apples", [deal({ price: 3, originalPrice: 5 })], "Fruit & Veg"),
    product("fruit-2", "Bananas", [deal({ price: 2, originalPrice: 4 })], "Fruit & Veg"),
    product("dairy-1", "Milk", [deal({ price: 4, originalPrice: 6 })], "Dairy & Eggs"),
  ];
  const deals = products.map((item) => ({ product: item, deal: item.currentDeals[0]! }));

  const result = buildForYouCategoryDeals(deals, "Fruit & Veg", [getNewSpecialDealKey("fruit-2", "New World")]);

  assert.deepEqual(result.map((item) => item.product.id), ["fruit-2", "fruit-1"]);
  assert.equal(result[0]?.isNew, true);
  assert.equal(result[1]?.isNew, false);
});

test("For you grouping keeps category order, empty categories, and new-first ranking", () => {
  const products = [
    product("fruit-1", "Apples", [deal({ price: 3, originalPrice: 5 })], "Fruit & Veg"),
    product("fruit-2", "Bananas", [deal({ price: 2, originalPrice: 4 })], "Fruit & Veg"),
    product("dairy-1", "Milk", [deal({ price: 4, originalPrice: 6 })], "Dairy & Eggs"),
  ];
  const deals = products.map((item) => ({ product: item, deal: item.currentDeals[0]! }));

  const result = buildForYouCategoryDealsByCategory(
    deals,
    ["Dairy & Eggs", "Pantry", "Fruit & Veg"],
    new Set([getNewSpecialDealKey("fruit-2", "New World")]),
  );

  assert.deepEqual(result.map(({ category }) => category), ["Dairy & Eggs", "Pantry", "Fruit & Veg"]);
  assert.deepEqual(result[1]?.deals, []);
  assert.deepEqual(result[2]?.deals.map(({ product: item }) => item.id), ["fruit-2", "fruit-1"]);
  assert.equal(result[2]?.deals[0]?.isNew, true);
});

test("For you grouping skips the source rail when no categories are selected", () => {
  const item = product("pantry-1", "Pantry item", [deal()], "Pantry");
  const result = buildForYouCategoryDealsByCategory(
    [{ product: item, deal: item.currentDeals[0]! }],
    [],
    [getNewSpecialDealKey("pantry-1", "New World")],
  );

  assert.deepEqual(result, []);
});

test("For you grouping caps each category without mutating the source rail", () => {
  const deals = Array.from({ length: 12 }, (_, index) => {
    const item = product(`pantry-${index}`, `Item ${index}`, [deal({ price: index + 1 })], "Pantry");
    return { product: item, deal: item.currentDeals[0]! };
  });
  const originalOrder = deals.map(({ product: item }) => item.id);

  const result = buildForYouCategoryDealsByCategory(deals, ["Pantry"]);

  assert.equal(result[0]?.deals.length, 10);
  assert.deepEqual(
    result[0]?.deals.map(({ product: item }) => item.id),
    [...Array.from({ length: 9 }, (_, index) => `pantry-${index}`), "pantry-10"],
  );
  assert.deepEqual(deals.map(({ product: item }) => item.id), originalOrder);
});

test("For you bounded ranking keeps new deals ahead without collecting the full category", () => {
  const deals = Array.from({ length: 11 }, (_, index) => {
    const item = product(`pantry-${index}`, `Item ${index}`, [deal({ price: index + 1 })], "Pantry");
    return { product: item, deal: item.currentDeals[0]! };
  });

  const result = buildForYouCategoryDealsByCategory(
    deals,
    ["Pantry"],
    [getNewSpecialDealKey("pantry-10", "New World")],
  );

  assert.deepEqual(
    result[0]?.deals.map(({ product: item }) => item.id),
    ["pantry-10", ...Array.from({ length: 9 }, (_, index) => `pantry-${index}`)],
  );
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
