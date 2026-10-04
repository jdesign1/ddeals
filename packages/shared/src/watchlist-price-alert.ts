export type WatchlistVerdict = "GENUINE" | "DODGY" | "MARGINAL" | "UNKNOWN";
export type WatchlistAlertType =
  | "returned_to_special"
  | "better_special_price"
  | "became_real_saver"
  | "became_dodgy";

export interface WatchlistPriceState {
  last_price: number;
  last_is_special: boolean;
  /** The published assessment at the last fresh observation. Null means the
   * state predates verdict tracking and should establish a baseline first. */
  last_verdict: WatchlistVerdict | null;
  last_notified_price: number | null;
}

export const WATCHLIST_MIN_PRICE_DROP = 0.25;
export const WATCHLIST_MIN_PERCENT_DROP = 0.05;
// Catalogue observations normally arrive every few days. Keep two full
// cycles of tolerance so a delayed scrape does not erase a useful baseline.
export const WATCHLIST_MAX_OBSERVATION_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export function isWatchlistObservationFresh(
  observedAt: string | Date | null | undefined,
  now = Date.now(),
): boolean {
  const timestamp = observedAt instanceof Date ? observedAt.getTime() : Date.parse(String(observedAt ?? ""));
  if (!Number.isFinite(timestamp)) return false;
  const age = now - timestamp;
  return age >= 0 && age <= WATCHLIST_MAX_OBSERVATION_AGE_MS;
}

/**
 * Decide whether a fresh catalogue observation is a meaningful Watchlist
 * alert. A first observation establishes a baseline and never alerts. Verdict
 * transitions are emitted independently of price movement so a product that
 * becomes safe to buy (or becomes Dodgy) is not missed when its price is flat.
 * Price alerts still require both the dollar and percentage thresholds.
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
  verdict: WatchlistVerdict | undefined;
}): WatchlistAlertType | null {
  if (!previous || !previousIsFresh || !isVerifiedSpecial || !verdict) return null;

  // Do not alert on rows created before verdict tracking was introduced. The
  // first post-migration observation fills the new baseline instead of
  // notifying every existing Watchlist item at once.
  if (previous.last_verdict && verdict !== previous.last_verdict) {
    if (verdict === "GENUINE") return "became_real_saver";
    if (verdict === "DODGY") return "became_dodgy";
  }

  if (verdict === "DODGY") return null;

  const referencePrice = previous.last_is_special
    ? Number(previous.last_notified_price ?? previous.last_price)
    : Number(previous.last_price);
  const absoluteDrop = referencePrice - currentPrice;
  const percentageDrop = referencePrice > 0 ? absoluteDrop / referencePrice : 0;
  if (absoluteDrop < WATCHLIST_MIN_PRICE_DROP || percentageDrop < WATCHLIST_MIN_PERCENT_DROP) return null;

  return previous.last_is_special ? "better_special_price" : "returned_to_special";
}
