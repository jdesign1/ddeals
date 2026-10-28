import { FREE_WATCHLIST_LIMIT } from "@dodgey-deals/shared";

export const WATCHLIST_UPGRADE_VISIT_INTERVAL = 5;

export interface WatchlistEntitlementItem {
  productId: string;
  addedAt: string;
}

export interface WatchlistEntitlementRow {
  id: string;
  product_id: string;
  added_at: string;
}

function addedAtTime(item: WatchlistEntitlementItem): number {
  const timestamp = Date.parse(item.addedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/** Free accounts keep their five most recently added products available. */
export function getLockedWatchlistProductIds(
  items: readonly WatchlistEntitlementItem[],
  hasUnlimitedAccess: boolean,
): ReadonlySet<string> {
  if (hasUnlimitedAccess) return new Set();

  const unlockedProductIds = new Set(
    [...items]
      .sort((left, right) => {
        const timeDifference = addedAtTime(right) - addedAtTime(left);
        if (timeDifference !== 0) return timeDifference;
        if (left.productId === right.productId) return 0;
        return left.productId < right.productId ? -1 : 1;
      })
      .slice(0, FREE_WATCHLIST_LIMIT)
      .map((item) => item.productId),
  );
  return new Set(items.filter((item) => !unlockedProductIds.has(item.productId)).map((item) => item.productId));
}

/**
 * Converts the denormalised list-item rows returned by Supabase into the
 * product-level entitlement used by the Watchlist UI. A product saved in
 * multiple lists remains one Watchlist product, with its latest save date
 * deciding the free-account allowance.
 */
export function getLockedWatchlistProductIdsFromRows(
  rows: readonly WatchlistEntitlementRow[],
  hasUnlimitedAccess: boolean,
): ReadonlySet<string> {
  const latestByProduct = new Map<string, { item: WatchlistEntitlementItem; id: string }>();
  for (const row of rows) {
    const current = latestByProduct.get(row.product_id);
    const next = { productId: row.product_id, addedAt: row.added_at };
    if (
      !current
      || addedAtTime(next) > addedAtTime(current.item)
      || (addedAtTime(next) === addedAtTime(current.item) && row.id > current.id)
    ) {
      latestByProduct.set(row.product_id, { item: next, id: row.id });
    }
  }
  return getLockedWatchlistProductIds([...latestByProduct.values()].map(({ item }) => item), hasUnlimitedAccess);
}

export function getUnlockedWatchlistProductIdsFromRows(
  rows: readonly WatchlistEntitlementRow[],
  hasUnlimitedAccess: boolean,
): ReadonlySet<string> {
  const lockedProductIds = getLockedWatchlistProductIdsFromRows(rows, hasUnlimitedAccess);
  return new Set(rows.map((row) => row.product_id).filter((productId) => !lockedProductIds.has(productId)));
}

export function shouldShowWatchlistUpgradePrompt(
  itemCount: number,
  visitCount: number,
  isPremium: boolean,
): boolean {
  return !isPremium
    && itemCount > FREE_WATCHLIST_LIMIT
    && visitCount > 0
    && visitCount % WATCHLIST_UPGRADE_VISIT_INTERVAL === 0;
}
