import { FREE_WATCHLIST_LIMIT } from "@dodgey-deals/shared";

export const WATCHLIST_UPGRADE_VISIT_INTERVAL = 5;

export interface WatchlistEntitlementItem {
  productId: string;
  addedAt: string;
}

function addedAtTime(item: WatchlistEntitlementItem): number {
  const timestamp = Date.parse(item.addedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

/** Free accounts keep their first five saved products available. */
export function getLockedWatchlistProductIds(
  items: readonly WatchlistEntitlementItem[],
  hasUnlimitedAccess: boolean,
): ReadonlySet<string> {
  if (hasUnlimitedAccess) return new Set();

  const unlockedProductIds = new Set(
    [...items]
      .sort((left, right) => addedAtTime(left) - addedAtTime(right))
      .slice(0, FREE_WATCHLIST_LIMIT)
      .map((item) => item.productId),
  );
  return new Set(items.filter((item) => !unlockedProductIds.has(item.productId)).map((item) => item.productId));
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
