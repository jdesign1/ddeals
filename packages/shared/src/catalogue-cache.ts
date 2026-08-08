import type { ProductCard } from "./data.ts";

/**
 * Persistent, cross-session, same-browser cache of the fully-built
 * specials catalogue, in IndexedDB. Direct TypeScript port of
 * `Prototype/index.html`'s `CATALOGUE_CACHE_*`/`openCatalogueCacheDB`/
 * `readCatalogueCache`/`writeCatalogueCache` (added there 2026-08-07 to
 * fix a real Supabase egress overage on the free plan — see project.md's
 * "Diagnosed and fixed Supabase egress overage" session).
 *
 * Ported 2026-08-08 in response to a second, related concern: `apps/mobile`
 * now has two screens (Home, Specials) independently calling
 * `loadLiveProducts()`, and every call that misses this cache re-fetches
 * the entire specials dataset PLUS `buildMatchIndex()`'s own two paginated
 * fetches (`products`, `app_comparable_family_links`) — real egress on a
 * free-tier project, and the same endpoints already implicated in this
 * session's earlier statement-timeout 500s. A warm cache hit (same
 * browser, within `CATALOGUE_CACHE_TTL_MS`) skips ALL of that network
 * traffic, not just the `dodgy_deals` fetch.
 *
 * This is a different, complementary thing to `data.ts`'s own short-TTL
 * (30s) in-memory promise cache: this one is cross-session (survives a
 * page reload/new tab) and doesn't need concurrent callers to overlap in
 * time to help; that one only collapses truly-simultaneous calls within
 * one page session. Both matter — see `loadLiveProducts()` in `data.ts`.
 *
 * `readCatalogueCache()`/`writeCatalogueCache()` never throw: any failure
 * (private browsing, blocked storage, `indexedDB` unavailable — e.g. under
 * Node's test runner or a server context — corrupt/missing/stale/
 * version-mismatched record) is treated as a cache miss / no-op, so
 * caching can never break the app if it fails. Caller always has the
 * normal network path as a fallback.
 */

const CATALOGUE_CACHE_DB = "dodgey_deals_mobile_cache";
const CATALOGUE_CACHE_STORE = "catalogue";
const CATALOGUE_CACHE_KEY = "live_products";
/** Bump whenever ProductCard's shape changes, so an old cached shape is treated as a miss rather than fed into code expecting new fields. */
const CATALOGUE_CACHE_VERSION = 1;
const CATALOGUE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour -- prices only change via the nightly scrape, so this is safely fresh, matching the prototype's own TTL.

interface CatalogueCacheRecord {
  version: number;
  savedAt: number;
  products: ProductCard[];
}

function openCatalogueCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(CATALOGUE_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(CATALOGUE_CACHE_STORE)) {
        req.result.createObjectStore(CATALOGUE_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
  });
}

/** Returns the cached products if present, version-matched, non-empty, and within TTL — otherwise null. Never throws. */
export async function readCatalogueCache(): Promise<ProductCard[] | null> {
  try {
    const db = await openCatalogueCacheDB();
    const record = await new Promise<CatalogueCacheRecord | null>((resolve, reject) => {
      const tx = db.transaction(CATALOGUE_CACHE_STORE, "readonly");
      const req = tx.objectStore(CATALOGUE_CACHE_STORE).get(CATALOGUE_CACHE_KEY);
      req.onsuccess = () => resolve((req.result as CatalogueCacheRecord) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record) return null;
    if (record.version !== CATALOGUE_CACHE_VERSION) return null;
    if (!Array.isArray(record.products) || !record.products.length) return null;
    if (Date.now() - record.savedAt > CATALOGUE_CACHE_TTL_MS) return null;
    return record.products;
  } catch {
    return null;
  }
}

/** Best-effort write — failures (quota, blocked storage) are swallowed, never surfaced. Caching is an optimization, not a requirement. */
export async function writeCatalogueCache(products: ProductCard[]): Promise<void> {
  try {
    if (!Array.isArray(products) || !products.length) return;
    const db = await openCatalogueCacheDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CATALOGUE_CACHE_STORE, "readwrite");
      const record: CatalogueCacheRecord = { version: CATALOGUE_CACHE_VERSION, savedAt: Date.now(), products };
      tx.objectStore(CATALOGUE_CACHE_STORE).put(record, CATALOGUE_CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // swallow -- best-effort only
  }
}

/** Test-only escape hatch to clear the cache between test cases without reaching into IndexedDB internals from the test file. */
export async function __clearCatalogueCacheForTests(): Promise<void> {
  try {
    const db = await openCatalogueCacheDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CATALOGUE_CACHE_STORE, "readwrite");
      tx.objectStore(CATALOGUE_CACHE_STORE).delete(CATALOGUE_CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // no-op if unavailable
  }
}

/**
 * Test-only: lets the test file write a raw record directly (bypassing
 * `writeCatalogueCache`'s own version/timestamp) to simulate an expired or
 * version-mismatched cache entry, and exposes the DB/store/key names so the
 * test doesn't have to duplicate (and risk drifting from) these constants.
 * Not part of the public API surface.
 */
export const __catalogueCacheTestInternals = {
  DB: CATALOGUE_CACHE_DB,
  STORE: CATALOGUE_CACHE_STORE,
  KEY: CATALOGUE_CACHE_KEY,
  VERSION: CATALOGUE_CACHE_VERSION,
  TTL_MS: CATALOGUE_CACHE_TTL_MS,
  openDB: openCatalogueCacheDB,
};
