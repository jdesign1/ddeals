// Real IndexedDB (fake-indexeddb), not mocked out -- needed because
// loadLiveProducts() now checks the persistent catalogue cache (see
// catalogue-cache.ts) before ever touching the network. Imported first so
// `global.indexedDB` exists before data.ts's import of catalogue-cache.ts
// evaluates its own `typeof indexedDB === "undefined"` guard.
import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  mergeProductMeta,
  buildProductCardsFromSpecials,
  buildMatchIndex,
  normalizeStoreKey,
  storeMatchesFilter,
  matchesAnySelectedStore,
  titleCase,
  loadLiveProducts,
  refreshLiveProducts,
  fetchPriceHistory90d,
  validateCurrentDeal,
  applyTargetedDealToProducts,
  __targetedDealValidations,
  __liveProductsRefreshes,
  __liveProductsCache,
  type DodgyDealsRow,
  type ProductCard,
  type SupabaseRestConfig,
} from "./data.ts";
import { readCatalogueCache, writeCatalogueCache, __clearCatalogueCacheForTests } from "./catalogue-cache.ts";

// The persistent IndexedDB cache (unlike __liveProductsCache) isn't scoped
// per-config -- it's one global "the live catalogue" entry, matching how
// the real app only ever talks to one Supabase project. Every test below
// must start from a clean IndexedDB cache or an earlier test's write would
// silently short-circuit a later test's network-call assertions.
beforeEach(async () => {
  await __clearCatalogueCacheForTests();
  __liveProductsRefreshes.clear();
  __targetedDealValidations.clear();
});

// ---- mergeProductMeta ----

test("mergeProductMeta picks the first non-null, non-empty value per field across members", () => {
  const result = mergeProductMeta([
    { name: null, brand: "Heinz", category: null, image_url: null, unit_size: null },
    { name: "Ketchup", brand: null, category: "Pantry", image_url: "", unit_size: "500g" },
  ]);
  assert.deepEqual(result, {
    name: "Ketchup",
    brand: "Heinz",
    category: "Pantry",
    image_url: null, // both candidates were "" / null -- correctly stays null, not ""
    unit_size: "500g",
  });
});

test("mergeProductMeta returns all-null when no member has any field set", () => {
  const result = mergeProductMeta([
    { name: null, brand: null, category: null, image_url: null, unit_size: null },
  ]);
  assert.deepEqual(result, {
    name: null,
    brand: null,
    category: null,
    image_url: null,
    unit_size: null,
  });
});

// ---- titleCase ----

test("titleCase capitalizes the first letter of every word", () => {
  assert.equal(titleCase("pak'nsave butter"), "Pak'Nsave Butter");
  assert.equal(titleCase(null), "");
  assert.equal(titleCase(undefined), "");
});

// ---- normalizeStoreKey / storeMatchesFilter ----

test("normalizeStoreKey strips non-letters and lowercases", () => {
  assert.equal(normalizeStoreKey("Woolworths NZ"), "woolworthsnz");
  assert.equal(normalizeStoreKey("Pak'nSave"), "paknsave");
  assert.equal(normalizeStoreKey(null), "");
});

test("storeMatchesFilter: 'all' matches everything, otherwise substring match on normalized key", () => {
  assert.equal(storeMatchesFilter("Woolworths NZ", "all"), true);
  assert.equal(storeMatchesFilter("Pak'nSave", "paknsave"), true);
  assert.equal(storeMatchesFilter("Woolworths NZ", "paknsave"), false);
});

// Extracted 2026-08-21 from FullScreenSearch.tsx's own local copy (see this
// function's own doc comment in data.ts) so Home's newly multi-select pill
// row and the search page's existing one share one tested implementation.
test("matchesAnySelectedStore: true if the store matches ANY selected filter, or 'all' is selected", () => {
  assert.equal(matchesAnySelectedStore("Woolworths NZ", ["all"]), true);
  assert.equal(matchesAnySelectedStore("Woolworths NZ", ["paknsave"]), false);
  assert.equal(matchesAnySelectedStore("Woolworths NZ", ["paknsave", "woolworths"]), true);
  assert.equal(matchesAnySelectedStore("Pak'nSave", []), false);
});

// ---- buildProductCardsFromSpecials ----

function row(overrides: Partial<DodgyDealsRow>): DodgyDealsRow {
  return {
    product_id: "p1",
    store_id: "woolworths",
    product_name: "Anchor Butter",
    brand: "Anchor",
    category: "Fridge",
    store_name: "Woolworths NZ",
    sale_price: 5,
    normal_price: 7,
    saving_pct: 28.6,
    special_label: null,
    was_price: 7,
    special_end_date: null,
    image_url: "https://example.com/img.jpg",
    unit_size: "500g",
    sale_started_at: "2026-08-01T00:00:00Z",
    verdict: "GENUINE",
    reason: "Saving 28.6% vs recent normal price",
    ...overrides,
  };
}

test("buildProductCardsFromSpecials: skips groups with no resolvable product name", () => {
  const rows = [row({ product_name: null, brand: null, category: null, image_url: null, unit_size: null })];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  assert.equal(cards.length, 0);
});

test("buildProductCardsFromSpecials: dedupes to the lowest price per store within a group", () => {
  // Same store appearing twice in one match group (known upstream identity-
  // matching quirk) -- must keep only the cheaper of the two.
  const rows = [
    row({ store_name: "Woolworths NZ", sale_price: 6 }),
    row({ store_name: "Woolworths NZ", sale_price: 4.5 }),
  ];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].currentDeals.length, 1);
  assert.equal(cards[0].currentDeals[0].price, 4.5);
});

test("buildProductCardsFromSpecials: maps verdict to dealType/reason and standardPrice to min normal_price", () => {
  const rows = [
    row({ store_name: "Woolworths NZ", sale_price: 5, normal_price: 7, verdict: "GENUINE" }),
    row({ store_name: "Pak'nSave", sale_price: 6.5, normal_price: 6, verdict: "DODGY" }),
  ];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  assert.equal(cards.length, 1);
  const [card] = cards;
  assert.equal(card.standardPrice, 6); // min(7, 6)
  const woolworthsDeal = card.currentDeals.find((d) => d.store === "Woolworths NZ");
  const paknsaveDeal = card.currentDeals.find((d) => d.store === "Pak'nSave");
  assert.equal(woolworthsDeal?.dealType, "Real Deal");
  assert.equal(paknsaveDeal?.dealType, "Dodgy Deal");
  assert.equal(paknsaveDeal?.wasArtificiallyInflated, true);
  assert.equal(woolworthsDeal?.sourceProductId, "p1");
  assert.equal(woolworthsDeal?.sourceStoreId, "woolworths");
});

test("buildProductCardsFromSpecials: legacy near-normal DODGY rows are shown as Fair Price", () => {
  const rows = [
    row({ sale_price: 5, normal_price: 5, verdict: "DODGY", reason: "Sale price is the same as the normal price" }),
  ];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  const deal = cards[0].currentDeals[0];
  assert.equal(deal.dealType, "Fair Price");
  assert.equal(deal.wasArtificiallyInflated, false);
});

test("buildProductCardsFromSpecials: UNKNOWN verdict maps to 'Unverified Deal'", () => {
  const rows = [row({ verdict: "UNKNOWN" })];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  assert.equal(cards[0].currentDeals[0].dealType, "Unverified Deal");
});

test("buildProductCardsFromSpecials: EARLY evidence stays neutral but carries its indicative baseline", () => {
  const rows = [row({
    verdict: "UNKNOWN",
    normal_price: 10,
    saving_pct: 20,
    reason: "Early read based on older regular prices",
    evidence_status: "EARLY",
    regular_price_samples: 2,
    regular_history_days: 20,
  })];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  const deal = cards[0].currentDeals[0];
  assert.equal(deal.dealType, "Unverified Deal");
  assert.equal(deal.evidenceStatus, "EARLY");
  assert.equal(deal.originalPrice, 10);
  assert.equal(deal.discountPercentage, 20);
});

test("buildProductCardsFromSpecials: insufficient evidence keeps a legacy DODGY row neutral", () => {
  const rows = [row({
    verdict: "DODGY",
    evidence_status: "INSUFFICIENT",
    regular_price_samples: 1,
    regular_history_days: 0,
  })];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  const deal = cards[0].currentDeals[0];
  assert.equal(deal.dealType, "Unverified Deal");
  assert.equal(deal.wasArtificiallyInflated, false);
  assert.equal(deal.evidenceStatus, "INSUFFICIENT");
});

test("buildProductCardsFromSpecials: maps price_history_90d_* columns to ninetyDay* fields", () => {
  const rows = [
    row({
      price_history_90d_low: 4.5,
      price_history_90d_high: 8.0,
      price_history_90d_avg: 6.25,
      price_history_90d_samples: 30,
      price_history_90d_special_samples: 0, // legitimately 0 ("never on special"), not "missing"
    }),
  ];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  const deal = cards[0].currentDeals[0];
  assert.equal(deal.ninetyDayLow, 4.5);
  assert.equal(deal.ninetyDayHigh, 8.0);
  assert.equal(deal.ninetyDayAvg, 6.25);
  assert.equal(deal.ninetyDaySamples, 30);
  assert.equal(deal.ninetyDaySpecialSamples, 0);
});

test("buildProductCardsFromSpecials: ninetyDay* fields are null when price_history_90d_* is absent from the row (pre-migration/no history)", () => {
  // Simulates both an un-migrated database (columns simply not requested/
  // present) and a real NULL price_history_90d_samples (no history in the
  // 90-day window) -- both surface identically as `undefined` on the row,
  // which must normalize to `null`, never leak through as `undefined`.
  const rows = [row({})];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  const deal = cards[0].currentDeals[0];
  assert.equal(deal.ninetyDayLow, null);
  assert.equal(deal.ninetyDayHigh, null);
  assert.equal(deal.ninetyDayAvg, null);
  assert.equal(deal.ninetyDaySamples, null);
  assert.equal(deal.ninetyDaySpecialSamples, null);
});

test("buildProductCardsFromSpecials: standardPrice falls back to min sale_price when no normal_price exists", () => {
  const rows = [row({ normal_price: null, sale_price: 4 }), row({ normal_price: null, sale_price: 3 })];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  assert.equal(cards[0].standardPrice, 3);
});

// ---- buildMatchIndex ----
// Added 2026-08-20 alongside the fix for "products already on your list
// still show a Plus icon instead of a tick on Home/Search" (see
// AddToListButton.tsx and buildMatchIndex's own doc comment for the full
// trace). Root cause: `find()`'s returned group id becomes `ProductCard.id`,
// which is exactly what gets written to `list_items.product_id` -- but
// neither `products` nor `app_comparable_family_links` is fetched with an
// `ORDER BY`, so nothing guaranteed the same real-world matched group
// resolved to the same root id on two different fetches. This proves the
// actual bug -- root id stability across different row-arrival orders --
// not just that grouping still works.

function installMatchIndexFetchStub(
  canonicalRows: { id: string; canonical_product_id: string }[],
  comparableRows: { left_product_id: string; right_product_id: string }[]
): { restore: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.includes("app_comparable_family_links") ? comparableRows : canonicalRows;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("buildMatchIndex: find() is stable regardless of row fetch order", async () => {
  // Same 3-product match group (p-b <-> p-c via canonical, p-a <-> p-c via
  // comparable), fetched in two different row orders -- simulates the DB
  // returning rows differently across two independent page loads (no
  // ORDER BY on either query, so this is legal, not a stub artifact).
  const canonical = [{ id: "p-b", canonical_product_id: "p-c" }];
  const comparableForward = [{ left_product_id: "p-a", right_product_id: "p-c" }];
  const comparableReversed = [{ left_product_id: "p-c", right_product_id: "p-a" }];

  const stub1 = installMatchIndexFetchStub(canonical, comparableForward);
  const indexForward = await buildMatchIndex({ url: "https://fake-order-a.example.com", anonKey: "k" });
  stub1.restore();

  const stub2 = installMatchIndexFetchStub(canonical, comparableReversed);
  const indexReversed = await buildMatchIndex({ url: "https://fake-order-b.example.com", anonKey: "k" });
  stub2.restore();

  // Both orders must resolve every id in the group to the SAME root --
  // the deterministic "smallest id wins" rule guarantees this regardless
  // of which union() calls ran first.
  assert.equal(indexForward.find("p-a"), "p-a");
  assert.equal(indexForward.find("p-b"), "p-a");
  assert.equal(indexForward.find("p-c"), "p-a");
  assert.equal(indexReversed.find("p-a"), "p-a");
  assert.equal(indexReversed.find("p-b"), "p-a");
  assert.equal(indexReversed.find("p-c"), "p-a");
});

// ---- loadLiveProducts request cache ----
// Added 2026-08-08 alongside the fix for real production 500s traced to
// concurrent overlapping calls (Home + Specials + React Strict Mode's
// double-invoked effects each firing an independent full paginated fetch
// pipeline against the same live Postgres instance). Verifies the actual
// bug -- overlapping callers sharing one underlying fetch -- not just that
// the function still returns data.

function fakeConfig(suffix: string): SupabaseRestConfig {
  // Unique url per test so each test gets its own cache entry -- tests run
  // in the same process/module scope as the real (module-level) cache.
  return { url: `https://fake-${suffix}.example.com`, anonKey: "anon-key" };
}

function installFetchStub(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null }, // no content-range -> fetchAllRows treats page 1 as the whole result
      json: async () => [],
    } as unknown as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("loadLiveProducts: concurrent overlapping calls share one in-flight fetch, not one each", async () => {
  const { calls, restore } = installFetchStub();
  try {
    const config = fakeConfig("concurrent");
    const [a, b] = await Promise.all([loadLiveProducts(config), loadLiveProducts(config)]);
    assert.deepEqual(a, b);
    // loadLiveProductsUncached makes 3 underlying fetchAllRows calls
    // (dodgy_deals_cache as of 2026-08-12, products, app_comparable_family_links)
    // -- 2 overlapping loadLiveProducts()
    // calls sharing one fetch means 3 total, not 6. This is the exact
    // production failure mode: before this cache existed, this would be 6.
    assert.equal(calls.length, 3, `expected 3 underlying fetches for 2 overlapping callers, got ${calls.length}`);
  } finally {
    restore();
  }
});

test("loadLiveProducts: a second call after the cache entry is evicted fetches again (not stuck stale forever)", async () => {
  const { calls, restore } = installFetchStub();
  try {
    const config = fakeConfig("eviction");
    await loadLiveProducts(config);
    assert.equal(calls.length, 3);
    __liveProductsCache.delete(`${config.url}::${config.anonKey}`);
    await loadLiveProducts(config);
    assert.equal(calls.length, 6, "expected a fresh fetch after manual cache eviction");
  } finally {
    restore();
  }
});

test("loadLiveProducts: a failed fetch is not cached, so the next caller gets a clean retry", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch;
  try {
    const config = fakeConfig("failure");
    await assert.rejects(() => loadLiveProducts(config));
    // Give the cache's .then/.catch a microtask turn to run its eviction before checking.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(__liveProductsCache.has(`${config.url}::${config.anonKey}`), false, "failed fetch should not remain cached");
  } finally {
    globalThis.fetch = original;
  }
});

// ---- loadLiveProducts <-> persistent IndexedDB catalogue cache ----
// Added 2026-08-08 after Jay asked specifically about egress efficiency.
// These prove the actual integration (loadLiveProducts really consults
// and populates the IndexedDB layer), not just that catalogue-cache.ts's
// own functions work in isolation (see catalogue-cache.test.ts for that).

function fakeProductCard(id: string): ProductCard {
  return {
    id,
    brand: "Test Brand",
    name: `Product ${id}`,
    category: "Pantry",
    image: "https://example.com/img.jpg",
    standardPrice: 5,
    unit: "500g",
    currentDeals: [],
    priceHistory: [],
    description: "",
  };
}

const SAMPLE_DODGY_DEALS_ROW: DodgyDealsRow = {
  product_id: "prod-1",
  store_id: "woolworths",
  product_name: "Anchor Butter",
  brand: "Anchor",
  category: "Fridge",
  store_name: "Woolworths NZ",
  sale_price: 5,
  normal_price: 7,
  saving_pct: 28.6,
  special_label: null,
  was_price: 7,
  special_end_date: null,
  image_url: "https://example.com/img.jpg",
  unit_size: "500g",
  sale_started_at: "2026-08-01T00:00:00Z",
  verdict: "GENUINE",
  reason: "Saving 28.6% vs recent normal price",
};

function installFetchStubWithOneRealRow(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const body = url.includes("dodgy_deals") ? [SAMPLE_DODGY_DEALS_ROW] : [];
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("loadLiveProducts: a warm IndexedDB cache hit skips the network fetch entirely", async () => {
  const cachedProducts = [fakeProductCard("p1"), fakeProductCard("p2")];
  await writeCatalogueCache(cachedProducts);

  const original = globalThis.fetch;
  let fetchWasCalled = false;
  globalThis.fetch = (async () => {
    fetchWasCalled = true;
    throw new Error("network should not be reached on a warm IndexedDB cache hit");
  }) as typeof fetch;

  try {
    const result = await loadLiveProducts(fakeConfig("warm-hit"));
    assert.deepEqual(result, cachedProducts);
    assert.equal(fetchWasCalled, false, "expected loadLiveProducts to skip the network fetch entirely");
  } finally {
    globalThis.fetch = original;
  }
});

test("loadLiveProducts: on a cache miss, the fetched result is written to IndexedDB for the next load", async () => {
  const { calls, restore } = installFetchStubWithOneRealRow();
  try {
    const config = fakeConfig("writeback");
    const result = await loadLiveProducts(config);
    assert.equal(result.length, 1, "expected one product card built from the one real dodgy_deals row");
    assert.equal(calls.length, 3, "expected the normal 3-call network pipeline on a cache miss");

    // writeCatalogueCache is fire-and-forget inside loadLiveProducts (not
    // awaited, matching the prototype's own pattern) -- give it a couple of
    // microtask turns to actually finish its IndexedDB write before checking.
    await Promise.resolve();
    await Promise.resolve();
    const nowCached = await readCatalogueCache();
    assert.deepEqual(nowCached, result, "expected the fetched result to now be served from IndexedDB");
  } finally {
    restore();
  }
});

test("refreshLiveProducts: repeated pulls are throttled after one full catalogue fetch", async () => {
  const { calls, restore } = installFetchStubWithOneRealRow();
  try {
    const config = fakeConfig("refresh-cooldown");
    const first = await refreshLiveProducts(config);
    const second = await refreshLiveProducts(config);

    assert.equal(first.refreshed, true);
    assert.equal(second.throttled, true);
    assert.deepEqual(second.products, first.products);
    assert.equal(calls.length, 3, "repeated pull gestures must not download the catalogue again");
  } finally {
    restore();
  }
});

test("refreshLiveProducts: the cooldown survives an in-memory reset via IndexedDB", async () => {
  const { calls, restore } = installFetchStubWithOneRealRow();
  try {
    const config = fakeConfig("refresh-persisted-cooldown");
    await refreshLiveProducts(config);
    __liveProductsRefreshes.clear();

    const second = await refreshLiveProducts(config);
    assert.equal(second.throttled, true);
    assert.equal(calls.length, 3, "a reload/new tab must respect the persisted refresh timestamp");
  } finally {
    restore();
  }
});

test("validateCurrentDeal: coalesces and throttles exact product/store checks", async () => {
  const { calls, restore } = installFetchStubWithOneRealRow();
  try {
    const config = fakeConfig("targeted-validation");
    const [first, overlapping] = await Promise.all([
      validateCurrentDeal(config, "prod-1", "woolworths"),
      validateCurrentDeal(config, "prod-1", "woolworths"),
    ]);
    assert.equal(first.refreshed, true);
    assert.equal(overlapping.refreshed, true);
    assert.equal(first.row?.product_id, "prod-1");
    assert.equal(calls.length, 1, "overlapping detail checks should share one request");
    assert.match(calls[0], /product_id=eq\.prod-1/);
    assert.match(calls[0], /store_id=eq\.woolworths/);

    const repeated = await validateCurrentDeal(config, "prod-1", "woolworths");
    assert.equal(repeated.throttled, true);
    assert.equal(repeated.row?.product_id, "prod-1");
    assert.equal(calls.length, 1, "repeat detail checks inside the cooldown should not fetch again");
  } finally {
    restore();
  }
});

test("fetchPriceHistory90d: includes the carry-in state and ordered transition points", async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const rows = url.includes("scraped_at=lt.")
      ? [{ price: 8, is_special: false, scraped_at: "2026-05-01T00:00:00Z" }]
      : [
          { price: 7, is_special: true, scraped_at: "2026-06-01T00:00:00Z" },
          { price: 9, is_special: false, scraped_at: "2026-07-01T00:00:00Z" },
        ];
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => rows,
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const points = await fetchPriceHistory90d(fakeConfig("history"), "prod-1", "paknsave");
    assert.deepEqual(points, [
      { price: 8, isSpecial: false, scrapedAt: "2026-05-01T00:00:00Z" },
      { price: 7, isSpecial: true, scrapedAt: "2026-06-01T00:00:00Z" },
      { price: 9, isSpecial: false, scrapedAt: "2026-07-01T00:00:00Z" },
    ]);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((url) => url.includes("product_id=eq.prod-1") && url.includes("store_id=eq.paknsave")));
  } finally {
    globalThis.fetch = original;
  }
});

test("validateCurrentDeal: caches a missing row during the cooldown", async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [],
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const config = fakeConfig("targeted-missing");
    const first = await validateCurrentDeal(config, "prod-gone", "paknsave");
    const second = await validateCurrentDeal(config, "prod-gone", "paknsave");
    assert.equal(first.row, null);
    assert.equal(second.row, null);
    assert.equal(second.throttled, true);
    assert.equal(calls.length, 1, "a missing special should not be rechecked repeatedly during the cooldown");
  } finally {
    globalThis.fetch = original;
  }
});

test("applyTargetedDealToProducts: updates a cached verdict or removes a retired special", () => {
  const original = buildProductCardsFromSpecials([[
    "group-1",
    [row({ product_id: "prod-1", store_id: "woolworths", verdict: "DODGY", normal_price: 5, sale_price: 4.89 })],
  ]]);
  const updatedRow = row({
    product_id: "prod-1",
    store_id: "woolworths",
    verdict: "UNKNOWN",
    evidence_status: "INSUFFICIENT",
    normal_price: 5,
    sale_price: 4.89,
  });
  const updated = applyTargetedDealToProducts(original, "prod-1", "woolworths", updatedRow);
  assert.equal(updated[0].currentDeals[0].dealType, "Unverified Deal");

  const removed = applyTargetedDealToProducts(updated, "prod-1", "woolworths", null);
  assert.equal(removed.length, 0, "a card with no remaining current deals should disappear");
});
