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
  normalizeStoreKey,
  storeMatchesFilter,
  titleCase,
  loadLiveProducts,
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
    row({ store_name: "Pak'nSave", sale_price: 5.5, normal_price: 6, verdict: "DODGY" }),
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
});

test("buildProductCardsFromSpecials: UNKNOWN verdict maps to 'Unverified Deal'", () => {
  const rows = [row({ verdict: "UNKNOWN" })];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  assert.equal(cards[0].currentDeals[0].dealType, "Unverified Deal");
});

test("buildProductCardsFromSpecials: standardPrice falls back to min sale_price when no normal_price exists", () => {
  const rows = [row({ normal_price: null, sale_price: 4 }), row({ normal_price: null, sale_price: 3 })];
  const cards = buildProductCardsFromSpecials([["group-1", rows]]);
  assert.equal(cards[0].standardPrice, 3);
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
    // loadLiveProductsUncached makes 3 underlying fetchAllRows calls (dodgy_deals,
    // products, app_comparable_family_links) -- 2 overlapping loadLiveProducts()
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
