import { normalizeStoreKey, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";
import { matchesDealFilter } from "./deal-filters.ts";

const SNAPSHOT_VERSION = 2;
const SNAPSHOT_STORAGE_PREFIX = "dd-semantic-specials-snapshot-v2:";
export const NEW_SPECIALS_PENDING_VERSION = 1;
const PENDING_STORAGE_PREFIX = "dd-semantic-specials-pending-v1:";
const PRICE_CHANGE_EPSILON = 0.005;
export const MAX_NEW_SPECIALS_PREVIEW_ITEMS = 3;
export const MAX_NEW_SPECIALS_DISPLAY_COUNT = 50;

type SnapshotEntry = {
  price: number;
  saleStartedAt: string | null;
};

export type NewSpecialsSnapshot = {
  version: number;
  deals: Record<string, SnapshotEntry>;
};

export type NewSpecialsSummary = {
  byStore: {
    woolworths: number;
    newworld: number;
    paknsave: number;
    foursquare: number;
  };
  realDeals: number;
  dodgyDeals: number;
  total: number;
  newlyStarted: number;
  priceDrops: number;
  allDealKeys: string[];
  realDealKeys: string[];
  dodgyDealKeys: string[];
  previewItems: NewSpecialsPreviewItem[];
};

export type NewSpecialsPreviewItem = {
  productId: string;
  name: string;
  store: string;
  price: number;
  change: "new" | "price-drop";
};

export type NewSpecialsPending = {
  version: number;
  summary: NewSpecialsSummary;
  snapshot: NewSpecialsSnapshot;
};

export function getNewSpecialsStorageScope(userId: string | null | undefined, isAnonymousSession = false): string {
  return userId && !isAnonymousSession ? `user:${userId}` : "device";
}

function scopedStorageKey(prefix: string, scope: string): string {
  return `${prefix}${encodeURIComponent(scope)}`;
}

export function getNewSpecialDealKey(productId: string, store: string): string {
  return `${productId}::${normalizeStoreKey(store)}`;
}

export function createNewSpecialsSnapshot(products: ProductCard[]): NewSpecialsSnapshot {
  const deals: Record<string, SnapshotEntry> = {};
  for (const product of products) {
    for (const deal of product.currentDeals) {
      if (!deal.isOnSpecial) continue;
      deals[getNewSpecialDealKey(product.id, deal.store)] = {
        price: deal.price,
        saleStartedAt: deal.saleStartedAt,
      };
    }
  }
  return { version: SNAPSHOT_VERSION, deals };
}

export function readNewSpecialsSnapshot(scope = "device"): NewSpecialsSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedStorageKey(SNAPSHOT_STORAGE_PREFIX, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewSpecialsSnapshot>;
    if (parsed.version !== SNAPSHOT_VERSION || !parsed.deals || typeof parsed.deals !== "object") return null;
    return { version: SNAPSHOT_VERSION, deals: parsed.deals as Record<string, SnapshotEntry> };
  } catch {
    return null;
  }
}

export function writeNewSpecialsSnapshot(snapshot: NewSpecialsSnapshot, scope = "device"): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(scopedStorageKey(SNAPSHOT_STORAGE_PREFIX, scope), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function readNewSpecialsPending(scope = "device"): NewSpecialsPending | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedStorageKey(PENDING_STORAGE_PREFIX, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewSpecialsPending>;
    if (parsed.version !== NEW_SPECIALS_PENDING_VERSION || !parsed.summary || !parsed.snapshot) return null;
    return {
      version: NEW_SPECIALS_PENDING_VERSION,
      summary: {
        ...(parsed.summary as NewSpecialsSummary),
        previewItems: Array.isArray(parsed.summary.previewItems) ? parsed.summary.previewItems : [],
      },
      snapshot: parsed.snapshot as NewSpecialsSnapshot,
    };
  } catch {
    return null;
  }
}

export function writeNewSpecialsPending(pending: NewSpecialsPending, scope = "device"): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(scopedStorageKey(PENDING_STORAGE_PREFIX, scope), JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

export function clearNewSpecialsPending(scope = "device"): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(scopedStorageKey(PENDING_STORAGE_PREFIX, scope));
    return true;
  } catch {
    return false;
  }
}

function hasLaterSaleStart(current: CurrentDeal, previous: SnapshotEntry): boolean {
  const currentStart = Date.parse(current.saleStartedAt ?? "");
  const previousStart = Date.parse(previous.saleStartedAt ?? "");
  return Number.isFinite(currentStart) && (!Number.isFinite(previousStart) || currentStart > previousStart);
}

/**
 * Finds meaningful special changes since the last device snapshot. A generic
 * catalogue refresh is deliberately not enough: an item must newly enter a
 * special or become cheaper while already on special.
 */
export function summarizeNewSpecials(products: ProductCard[], previous: NewSpecialsSnapshot): NewSpecialsSummary {
  const summary: NewSpecialsSummary = {
    byStore: { woolworths: 0, newworld: 0, paknsave: 0, foursquare: 0 },
    realDeals: 0,
    dodgyDeals: 0,
    total: 0,
    newlyStarted: 0,
    priceDrops: 0,
    allDealKeys: [],
    realDealKeys: [],
    dodgyDealKeys: [],
    previewItems: [],
  };

  for (const product of products) {
    for (const deal of product.currentDeals) {
      if (!deal.isOnSpecial) continue;
      const key = getNewSpecialDealKey(product.id, deal.store);
      const previousDeal = previous.deals[key];
      const hasStarted = !previousDeal || hasLaterSaleStart(deal, previousDeal);
      const hasPriceDrop = Boolean(previousDeal && deal.price < previousDeal.price - PRICE_CHANGE_EPSILON);
      if (!hasStarted && !hasPriceDrop) continue;

      summary.total += 1;
      summary.allDealKeys.push(key);
      if (hasStarted) summary.newlyStarted += 1;
      else summary.priceDrops += 1;

      if (summary.previewItems.length < MAX_NEW_SPECIALS_PREVIEW_ITEMS) {
        summary.previewItems.push({
          productId: product.id,
          name: product.name,
          store: deal.store,
          price: deal.price,
          change: hasStarted ? "new" : "price-drop",
        });
      }

      const storeKey = normalizeStoreKey(deal.store);
      if (storeKey.includes("woolworths")) summary.byStore.woolworths += 1;
      else if (storeKey.includes("newworld")) summary.byStore.newworld += 1;
      else if (storeKey.includes("paknsave")) summary.byStore.paknsave += 1;
      else if (storeKey.includes("foursquare")) summary.byStore.foursquare += 1;

      if (matchesDealFilter(deal, "real")) {
        summary.realDeals += 1;
        summary.realDealKeys.push(key);
      }
      if (matchesDealFilter(deal, "dodgy")) {
        summary.dodgyDeals += 1;
        summary.dodgyDealKeys.push(key);
      }
    }
  }

  return summary;
}
