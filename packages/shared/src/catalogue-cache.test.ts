// Real IndexedDB behavior, not mocked out -- `fake-indexeddb` is a
// purpose-built, in-memory implementation of the actual IndexedDB spec
// (used widely for exactly this kind of test), not a stand-in for real
// application data. Imported first, before the module under test, so
// `global.indexedDB` exists before `catalogue-cache.ts`'s own
// `typeof indexedDB === "undefined"` guard is ever evaluated.
import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  readCatalogueCache,
  writeCatalogueCache,
  __clearCatalogueCacheForTests,
  __catalogueCacheTestInternals,
} from "./catalogue-cache.ts";
import type { ProductCard } from "./data.ts";

function fakeProduct(id: string): ProductCard {
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

/** Writes a raw record directly, bypassing writeCatalogueCache's own version/timestamp -- for simulating expired/stale records a real caller would produce over time. */
async function writeRawRecord(record: { version: number; savedAt: number; products: ProductCard[] }) {
  const db = await __catalogueCacheTestInternals.openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(__catalogueCacheTestInternals.STORE, "readwrite");
    tx.objectStore(__catalogueCacheTestInternals.STORE).put(record, __catalogueCacheTestInternals.KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(async () => {
  await __clearCatalogueCacheForTests();
});

test("readCatalogueCache: returns null when nothing has been cached yet", async () => {
  assert.equal(await readCatalogueCache(), null);
});

test("writeCatalogueCache then readCatalogueCache: real round trip through IndexedDB", async () => {
  const products = [fakeProduct("p1"), fakeProduct("p2")];
  await writeCatalogueCache(products);
  const result = await readCatalogueCache();
  assert.deepEqual(result, products);
});

test("writeCatalogueCache: never writes an empty array (would otherwise serve empty results as a false 'warm hit')", async () => {
  await writeCatalogueCache([]);
  assert.equal(await readCatalogueCache(), null);
});

test("readCatalogueCache: a record older than the TTL is treated as a miss", async () => {
  const staleTimestamp = Date.now() - __catalogueCacheTestInternals.TTL_MS - 1000;
  await writeRawRecord({
    version: __catalogueCacheTestInternals.VERSION,
    savedAt: staleTimestamp,
    products: [fakeProduct("p1")],
  });
  assert.equal(await readCatalogueCache(), null);
});

test("readCatalogueCache: a record just inside the TTL is still a hit", async () => {
  const freshTimestamp = Date.now() - (__catalogueCacheTestInternals.TTL_MS - 1000);
  const products = [fakeProduct("p1")];
  await writeRawRecord({ version: __catalogueCacheTestInternals.VERSION, savedAt: freshTimestamp, products });
  assert.deepEqual(await readCatalogueCache(), products);
});

test("readCatalogueCache: a version mismatch is treated as a miss (old cached shape never fed into code expecting new fields)", async () => {
  await writeRawRecord({
    version: __catalogueCacheTestInternals.VERSION - 1,
    savedAt: Date.now(),
    products: [fakeProduct("p1")],
  });
  assert.equal(await readCatalogueCache(), null);
});

test("readCatalogueCache: never throws when indexedDB is unavailable (e.g. a server/Node context)", async () => {
  const original = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  // @ts-expect-error -- deliberately removing it to simulate a non-browser environment
  delete globalThis.indexedDB;
  try {
    await assert.doesNotReject(() => readCatalogueCache());
    assert.equal(await readCatalogueCache(), null);
  } finally {
    globalThis.indexedDB = original as IDBFactory;
  }
});

test("writeCatalogueCache: never throws when indexedDB is unavailable", async () => {
  const original = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  // @ts-expect-error -- deliberately removing it to simulate a non-browser environment
  delete globalThis.indexedDB;
  try {
    await assert.doesNotReject(() => writeCatalogueCache([fakeProduct("p1")]));
  } finally {
    globalThis.indexedDB = original as IDBFactory;
  }
});
