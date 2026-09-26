export type WatchlistAlertType = "returned_to_special" | "better_special_price";

export interface WatchlistPriceState {
  last_price: number;
  last_is_special: boolean;
  last_notified_price: number | null;
}

export const WATCHLIST_MIN_PRICE_DROP = 0.25;
export const WATCHLIST_MIN_PERCENT_DROP = 0.05;

/**
 * Decide whether a fresh catalogue observation is a meaningful Watchlist
 * price alert. A first observation establishes a baseline and never alerts;
 * subsequent alerts must clear both the dollar and percentage thresholds.
 */
export function detectWatchlistPriceAlert({
  previous,
  previousIsFresh,
  currentPrice,
  isVerifiedSpecial,
  verdict,
}: {
  previous: WatchlistPriceState | undefined;
  previousIsFresh: boolean;
  currentPrice: number;
  isVerifiedSpecial: boolean;
  verdict: string | undefined;
}): WatchlistAlertType | null {
  if (!previous || !previousIsFresh || !isVerifiedSpecial || verdict === "DODGY") return null;

  const referencePrice = previous.last_is_special
    ? Number(previous.last_notified_price ?? previous.last_price)
    : Number(previous.last_price);
  const absoluteDrop = referencePrice - currentPrice;
  const percentageDrop = referencePrice > 0 ? absoluteDrop / referencePrice : 0;
  if (absoluteDrop < WATCHLIST_MIN_PRICE_DROP || percentageDrop < WATCHLIST_MIN_PERCENT_DROP) return null;

  return previous.last_is_special ? "better_special_price" : "returned_to_special";
}
