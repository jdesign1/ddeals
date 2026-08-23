import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildListItemProductCard,
  loadListsPageData,
  invalidateListsPageCache,
  __listsPageCache,
  type ListPriceLookups,
  type ListItemProductMeta,
} from "./lists.ts";
import type { SupabaseClient } from "./supabase.ts";
import type { SupabaseRestConfig } from "./data.ts";

/**
 * Coverage for `buildListItemProductCard` (2026-08-20, Lists-page UX audit
 * -- see that function's own doc comment in lists.ts). `lists.ts` had no
 * test file at all before this one; scoped to just this new function
 * rather than retrofitting coverage for everything else in the file.
 */

const META: ListItemProductMeta = {
  name: "chocolate milk",
  brand: "anchor",
  category: "Dairy",
  image_url: "https://example.com/milk.jpg",
  unit_size: "1L",
};

function lookups(overrides: Partial<ListPriceLookups> = {}): ListPriceLookups {
  return {
    cheapestByProduct: new Map(),
    dealByProductStore: new Map(),
    storesByProduct: new Map(),
    priceAtStore: new Map(),
    allStoreIds: new Set(),
    ...overrides,
  };
}

test("returns null when there's no product meta at all", () => {
  const result = buildListItemProductCard(
    "p1",
    undefined,
    lookups({ cheapestByProduct: new Map([["p1", { product_id: "p1", store_id: "woolworths", price: 3, is_special: false }]]) })
  );
  assert.equal(result, null);
});

test("returns null when the product has no current price (excluded, not fabricated)", () => {
  const result = buildListItemProductCard("p1", META, lookups());
  assert.equal(result, null);
});

test("GENUINE verdict at the cheapest store -> Real Deal, real discount %", () => {
  const l = lookups({
    cheapestByProduct: new Map([["p1", { product_id: "p1", store_id: "newworld", price: 4, is_special: true }]]),
    dealByProductStore: new Map([["p1:newworld", { product_id: "p1", store_id: "newworld", verdict: "GENUINE", normal_price: 8 }]]),
  });
  const card = buildListItemProductCard("p1", META, l);
  assert.ok(card);
  assert.equal(card!.currentDeals.length, 1);
  const deal = card!.currentDeals[0];
  assert.equal(deal.dealType, "Real Deal");
  assert.equal(deal.store, "New World");
  assert.equal(deal.price, 4);
  assert.equal(deal.originalPrice, 8);
  assert.equal(deal.discountPercentage, 50);
  assert.equal(deal.wasArtificiallyInflated, false);
  assert.equal(deal.isOnSpecial, true);
});

test("DODGY verdict -> Dodgy Deal, wasArtificiallyInflated true", () => {
  const l = lookups({
    cheapestByProduct: new Map([["p1", { product_id: "p1", store_id: "paknsave", price: 5, is_special: true }]]),
    dealByProductStore: new Map([["p1:paknsave", { product_id: "p1", store_id: "paknsave", verdict: "DODGY", normal_price: 5 }]]),
  });
  const card = buildListItemProductCard("p1", META, l);
  const deal = card!.currentDeals[0];
  assert.equal(deal.dealType, "Dodgy Deal");
  assert.equal(deal.wasArtificiallyInflated, true);
  // normal_price === price -- no real discount despite being "on special".
  assert.equal(deal.discountPercentage, 0);
});

test("on special but no matching dodgy_deals_cache row -> Unverified Deal, not Fair Price", () => {
  const l = lookups({
    cheapestByProduct: new Map([["p1", { product_id: "p1", store_id: "woolworths", price: 3, is_special: true }]]),
  });
  const card = buildListItemProductCard("p1", META, l);
  assert.equal(card!.currentDeals[0].dealType, "Unverified Deal");
});

test("not on special, no dodgy_deals_cache row -> Fair Price, 0% discount, same as fetchNonSpecialProductCards' convention", () => {
  const l = lookups({
    cheapestByProduct: new Map([["p1", { product_id: "p1", store_id: "foursquare", price: 6, is_special: false }]]),
  });
  const card = buildListItemProductCard("p1", META, l);
  const deal = card!.currentDeals[0];
  assert.equal(deal.dealType, "Fair Price");
  assert.equal(deal.discountPercentage, 0);
  assert.equal(deal.originalPrice, deal.price);
});

test("uses a live special at another store instead of greying the product because its cheapest price is regular", () => {
  const l = lookups({
    cheapestByProduct: new Map([["p1", { product_id: "p1", store_id: "foursquare", price: 5, is_special: false }]]),
    specialByProduct: new Map([["p1", { product_id: "p1", store_id: "newworld", price: 6, is_special: true }]]),
    dealByProductStore: new Map([["p1:newworld", { product_id: "p1", store_id: "newworld", verdict: "GENUINE", normal_price: 8 }]]),
  });
  const deal = buildListItemProductCard("p1", META, l)!.currentDeals[0];
  assert.equal(deal.store, "New World");
  assert.equal(deal.price, 6);
  assert.equal(deal.isOnSpecial, true);
  assert.equal(deal.dealType, "Real Deal");
});

test("greys an orphaned special flag when no live deal-cache row matches", () => {
  const l = lookups({
    cheapestByProduct: new Map([[
      "p1",
      { product_id: "p1", store_id: "woolworths", price: 3, is_special: true },
    ]]),
    specialByProduct: new Map(),
  });
  const deal = buildListItemProductCard("p1", META, l)!.currentDeals[0];
  assert.equal(deal.isOnSpecial, false);
  assert.equal(deal.dealType, "Fair Price");
});

test("UNKNOWN verdict row falls through to the is_special check, same as no row at all", () => {
  const l = lookups({
    cheapestByProduct: new Map([["p1", { product_id: "p1", store_id: "woolworths", price: 3, is_special: true }]]),
    dealByProductStore: new Map([["p1:woolworths", { product_id: "p1", store_id: "woolworths", verdict: "UNKNOWN", normal_price: null }]]),
  });
  const card = buildListItemProductCard("p1", META, l);
  assert.equal(card!.currentDeals[0].dealType, "Unverified Deal");
});

test("product-level fields carry through from meta, with the same fallbacks fetchNonSpecialProductCards uses", () => {
  const l = lookups({
    cheapestByProduct: new Map([["p1", { product_id: "p1", store_id: "woolworths", price: 3, is_special: false }]]),
  });
  const card = buildListItemProductCard(
    "p1",
    { name: "cola", brand: null, category: null, image_url: null, unit_size: null },
    l
  );
  assert.ok(card);
  assert.equal(card!.brand, "Unbranded");
  assert.equal(card!.category, "Grocery");
  assert.ok(card!.image.length > 0); // FALLBACK_PRODUCT_IMAGE, not empty/undefined
  assert.equal(card!.unit, "");
  assert.deepEqual(card!.priceHistory, []);
  assert.equal(card!.description, "");
});

// ---- loadListsPageData / invalidateListsPageCache ----
// Added 2026-08-20, per Jay: "Can we cache the lists in a smart way? so
// they don't need to be loaded each time you select the lists tab" -- see
// `loadListsPageData`'s own doc comment (just above it in lists.ts) for
// the full design. These prove the actual cache mechanics (repeat calls
// for one user share a fetch, different users don't share each other's,
// invalidation forces a real refetch) using a fake client with EMPTY
// lists -- with no lists, `fetchItemsForLists` short-circuits
// (`if (!listIds.length) return []`) before ever calling
// `client.from("list_items")`, and `fetchListPriceLookups`/`fetchByIds`
// both short-circuit the same way on an empty product-id array, so
// exactly ONE `client.from()` call ("lists") happens per real underlying
// fetch -- counting those calls alone is enough to prove dedup/
// invalidation without also stubbing `fetch` for the REST-based calls.

function fakeListsConfig(suffix: string): SupabaseRestConfig {
  return { url: `https://fake-lists-${suffix}.example.com`, anonKey: "anon-key" };
}

function installFakeListsClient(): { client: SupabaseClient; fromCalls: string[] } {
  const fromCalls: string[] = [];
  const builder = {
    select() {
      return builder;
    },
    order() {
      return builder;
    },
    in() {
      return builder;
    },
    eq() {
      return builder;
    },
    then(onFulfilled: (v: { data: unknown[]; error: null }) => void) {
      onFulfilled({ data: [], error: null });
    },
  };
  const client = {
    from(table: string) {
      fromCalls.push(table);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, fromCalls };
}

test("loadListsPageData: repeat calls for the same user share one fetch, not one each", async () => {
  const { client, fromCalls } = installFakeListsClient();
  const config = fakeListsConfig("dedup");
  invalidateListsPageCache("user-dedup"); // clean slate -- the cache is module-level, persists across tests
  const [a, b] = await Promise.all([
    loadListsPageData(client, config, "user-dedup"),
    loadListsPageData(client, config, "user-dedup"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(fromCalls.length, 1, `expected 1 underlying fetch for 2 overlapping callers, got ${fromCalls.length}`);
});

test("loadListsPageData: a different user does not share the first user's cache entry", async () => {
  const { client, fromCalls } = installFakeListsClient();
  const config = fakeListsConfig("per-user");
  invalidateListsPageCache("user-a");
  invalidateListsPageCache("user-b");
  await loadListsPageData(client, config, "user-a");
  await loadListsPageData(client, config, "user-b");
  assert.equal(fromCalls.length, 2, "expected each user's own independent fetch, not a shared one");
});

test("invalidateListsPageCache: a call after invalidation fetches again, not stuck stale", async () => {
  const { client, fromCalls } = installFakeListsClient();
  const config = fakeListsConfig("invalidate");
  invalidateListsPageCache("user-invalidate");
  await loadListsPageData(client, config, "user-invalidate");
  assert.equal(fromCalls.length, 1);
  invalidateListsPageCache("user-invalidate");
  await loadListsPageData(client, config, "user-invalidate");
  assert.equal(fromCalls.length, 2, "expected a fresh fetch after invalidation, not the stale cached entry");
});

test("invalidateListsPageCache: with no argument, clears every user's cache entry", () => {
  __listsPageCache.set("user-x", { promise: Promise.resolve({} as never), resolvedAt: Date.now() });
  __listsPageCache.set("user-y", { promise: Promise.resolve({} as never), resolvedAt: Date.now() });
  invalidateListsPageCache();
  assert.equal(__listsPageCache.size, 0);
});
