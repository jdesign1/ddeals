import { normalizeStoreKey, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";
import { matchesDealFilter } from "./deal-filters.ts";

const SNAPSHOT_VERSION = 2;
const SNAPSHOT_STORAGE_PREFIX = "dd-semantic-specials-snapshot-v2:";
export const NEW_SPECIALS_PENDING_TTL_MS = 48 * 60 * 60 * 1000;
export const NEW_SPECIALS_PENDING_VERSION = 3;
export const NEW_SPECIALS_POPUP_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const NEW_SPECIALS_POPUP_STATE_VERSION = 1;
export const NEW_SPECIALS_POPUP_SUPPRESS_EVENT = "dd:suppress-new-specials-popup-until-home-exit";
const PENDING_STORAGE_PREFIX = "dd-semantic-specials-pending-v3:";
const POPUP_STATE_STORAGE_PREFIX = "dd-semantic-specials-popup-state-v1:";
const PRICE_CHANGE_EPSILON = 0.005;

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
  newlyStartedDealKeys: string[];
  priceDropDealKeys: string[];
};

export type NewSpecialsPending = {
  version: number;
  /** Stable identity for this user's/device's unread discovery batch. */
  batchId: string;
  /** When the batch was first detected locally. */
  detectedAt: number;
  /** Unread batches are eventually retired so stale badges do not linger. */
  expiresAt: number;
  /** Popup presentation is separate from whether the batch was reviewed. */
  popupPresented: boolean;
  summary: NewSpecialsSummary;
  snapshot: NewSpecialsSnapshot;
};

/**
 * Popup throttling is deliberately separate from the unread batch. A batch
 * can remain useful for 48 hours, while the modal should interrupt a user at
 * most once per rolling 24-hour window and only when its contents changed.
 */
export type NewSpecialsPopupState = {
  version: number;
  lastShownAt: number | null;
  lastShownFingerprint: string | null;
};

/**
 * Suppress the automatic popup during the route transition caused by logout.
 * This is intentionally an in-memory event rather than persisted state so a
 * later app launch can still surface the unread batch.
 */
export function suppressNewSpecialsPopupUntilHomeExit(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NEW_SPECIALS_POPUP_SUPPRESS_EVENT));
  }
}

export function createNewSpecialsBatchId(now = Date.now()): string {
  const randomId = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${now}-${randomId}`;
}

export function createNewSpecialsPending(
  summary: NewSpecialsSummary,
  snapshot: NewSpecialsSnapshot,
  now = Date.now(),
): NewSpecialsPending {
  return {
    version: NEW_SPECIALS_PENDING_VERSION,
    batchId: createNewSpecialsBatchId(now),
    detectedAt: now,
    expiresAt: now + NEW_SPECIALS_PENDING_TTL_MS,
    popupPresented: false,
    summary,
    snapshot,
  };
}

export function isNewSpecialsPendingActive(pending: NewSpecialsPending, now = Date.now()): boolean {
  return pending.summary.total > 0 && pending.expiresAt > now;
}

/** Legacy v3 compatibility helper; new popup eligibility uses the separate cooldown state. */
export function isNewSpecialsPopupPresented(
  pending: Pick<NewSpecialsPending, "batchId" | "popupPresented"> | null,
  sessionPresentedBatchId: string | null,
): boolean {
  return Boolean(pending && (pending.popupPresented || sessionPresentedBatchId === pending.batchId));
}

/** Stable identity for the currently unread deal set and its meaningful counts. */
export function getNewSpecialsSummaryFingerprint(summary: NewSpecialsSummary): string {
  return JSON.stringify({
    ...summary,
    allDealKeys: [...summary.allDealKeys].sort(),
    realDealKeys: [...summary.realDealKeys].sort(),
    dodgyDealKeys: [...summary.dodgyDealKeys].sort(),
    newlyStartedDealKeys: [...summary.newlyStartedDealKeys].sort(),
    priceDropDealKeys: [...summary.priceDropDealKeys].sort(),
  });
}

export function createNewSpecialsPopupState(
  summary: NewSpecialsSummary,
  now = Date.now(),
): NewSpecialsPopupState {
  return {
    version: NEW_SPECIALS_POPUP_STATE_VERSION,
    lastShownAt: now,
    lastShownFingerprint: getNewSpecialsSummaryFingerprint(summary),
  };
}

export function readNewSpecialsPopupState(scope = "device"): NewSpecialsPopupState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedStorageKey(POPUP_STATE_STORAGE_PREFIX, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewSpecialsPopupState>;
    if (
      parsed.version !== NEW_SPECIALS_POPUP_STATE_VERSION
      || (parsed.lastShownAt !== null && typeof parsed.lastShownAt !== "number")
      || (parsed.lastShownFingerprint !== null && typeof parsed.lastShownFingerprint !== "string")
    ) return null;
    return {
      version: NEW_SPECIALS_POPUP_STATE_VERSION,
      lastShownAt: parsed.lastShownAt ?? null,
      lastShownFingerprint: parsed.lastShownFingerprint ?? null,
    };
  } catch {
    return null;
  }
}

export function writeNewSpecialsPopupState(state: NewSpecialsPopupState, scope = "device"): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(scopedStorageKey(POPUP_STATE_STORAGE_PREFIX, scope), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * A popup is eligible only for unread data that was not in the last popup.
 * The cooldown is measured from actual presentation, not scrape time.
 */
export function canShowNewSpecialsPopup(
  summary: NewSpecialsSummary,
  state: NewSpecialsPopupState | null,
  now = Date.now(),
): boolean {
  if (summary.total <= 0) return false;
  const fingerprint = getNewSpecialsSummaryFingerprint(summary);
  const hasNewData = !state?.lastShownFingerprint || state.lastShownFingerprint !== fingerprint;
  const cooldownExpired = !state?.lastShownAt || now - state.lastShownAt >= NEW_SPECIALS_POPUP_COOLDOWN_MS;
  return hasNewData && cooldownExpired;
}

function storeKeyFromDealKey(dealKey: string): string {
  const separatorIndex = dealKey.lastIndexOf("::");
  return separatorIndex >= 0 ? dealKey.slice(separatorIndex + 2) : "";
}

/** Removes only the exact keys the user has successfully reached. */
export function removeReviewedNewSpecials(
  summary: NewSpecialsSummary,
  reviewedDealKeys: readonly string[],
): NewSpecialsSummary | null {
  const reviewed = new Set(reviewedDealKeys);
  const remaining = (keys: readonly string[]) => keys.filter((key) => !reviewed.has(key));
  const allDealKeys = remaining(summary.allDealKeys);
  if (allDealKeys.length === 0) return null;

  const byStore = { woolworths: 0, newworld: 0, paknsave: 0, foursquare: 0 };
  for (const key of allDealKeys) {
    const store = storeKeyFromDealKey(key);
    if (store.includes("woolworths")) byStore.woolworths += 1;
    else if (store.includes("newworld")) byStore.newworld += 1;
    else if (store.includes("paknsave")) byStore.paknsave += 1;
    else if (store.includes("foursquare")) byStore.foursquare += 1;
  }

  const realDealKeys = remaining(summary.realDealKeys);
  const dodgyDealKeys = remaining(summary.dodgyDealKeys);
  const newlyStartedDealKeys = remaining(summary.newlyStartedDealKeys);
  const priceDropDealKeys = remaining(summary.priceDropDealKeys);
  return {
    byStore,
    realDeals: realDealKeys.length,
    dodgyDeals: dodgyDealKeys.length,
    total: allDealKeys.length,
    newlyStarted: newlyStartedDealKeys.length,
    priceDrops: priceDropDealKeys.length,
    allDealKeys,
    realDealKeys,
    dodgyDealKeys,
    newlyStartedDealKeys,
    priceDropDealKeys,
  };
}

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
    if (
      parsed.version !== NEW_SPECIALS_PENDING_VERSION
      || typeof parsed.batchId !== "string"
      || typeof parsed.detectedAt !== "number"
      || typeof parsed.expiresAt !== "number"
      || typeof parsed.popupPresented !== "boolean"
      || !parsed.summary
      || !parsed.snapshot
      || !Array.isArray((parsed.summary as Partial<NewSpecialsSummary>).newlyStartedDealKeys)
      || !Array.isArray((parsed.summary as Partial<NewSpecialsSummary>).priceDropDealKeys)
    ) return null;
    return {
      version: NEW_SPECIALS_PENDING_VERSION,
      batchId: parsed.batchId,
      detectedAt: parsed.detectedAt,
      expiresAt: parsed.expiresAt,
      popupPresented: parsed.popupPresented,
      summary: parsed.summary as NewSpecialsSummary,
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
  // Filling in a previously-missing timestamp is not evidence that the
  // promotion itself just started. Only compare two known timestamps; a real
  // newly observed deal is still handled by the !previousDeal branch below.
  return Number.isFinite(currentStart) && Number.isFinite(previousStart) && currentStart > previousStart;
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
    newlyStartedDealKeys: [],
    priceDropDealKeys: [],
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
      if (hasStarted) {
        summary.newlyStarted += 1;
        summary.newlyStartedDealKeys.push(key);
      } else {
        summary.priceDrops += 1;
        summary.priceDropDealKeys.push(key);
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
