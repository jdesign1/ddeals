export type WatchlistVerdict = "GENUINE" | "DODGY" | "MARGINAL" | "UNKNOWN";
export type WatchlistAlertType =
  | "returned_to_special"
  | "better_special_price"
  | "verdict_changed";

export interface WatchlistPriceState {
  last_price: number;
  last_is_special: boolean;
  /** The published assessment at the last fresh observation. Null means the
   * state predates verdict tracking and should establish a baseline first. */
  last_verdict: WatchlistVerdict | null;
  last_notified_price: number | null;
}

// Catalogue observations normally arrive every few days. Keep two full
// cycles of tolerance so a delayed scrape does not erase a useful baseline.
export const WATCHLIST_MAX_OBSERVATION_AGE_MS = 8 * 24 * 60 * 60 * 1000;
// A special-price drop must be at least 20 cents and 5% of the last alert price.
export const WATCHLIST_MIN_MEANINGFUL_PRICE_DROP_CENTS = 20;
export const WATCHLIST_MIN_MEANINGFUL_PRICE_DROP_RATE = 0.05;

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
 * Decide which confirmed Watchlist changes should create alerts. A first
 * observation establishes a baseline and never alerts. Price alerts are
 * limited to a return to special or a meaningful drop while already on
 * special. Verdict changes require a known previous and current verdict. The
 * caller supplies freshness for both observations so stale rows cannot alert.
 */
export function detectWatchlistAlerts({
  previous,
  previousIsFresh,
  currentIsFresh,
  currentPrice,
  currentVerdict,
}: {
  previous: WatchlistPriceState | undefined;
  previousIsFresh: boolean;
  currentIsFresh: boolean;
  currentPrice: number;
  currentVerdict: WatchlistVerdict | null;
}): WatchlistAlertType[] {
  if (!previous || !previousIsFresh || !currentIsFresh) return [];
  if (!Number.isFinite(currentPrice) || currentPrice < 0) return [];
  if (!Number.isFinite(Number(previous.last_price)) || Number(previous.last_price) < 0) return [];

  const currentPriceCents = Math.round(currentPrice * 100);
  const alerts: WatchlistAlertType[] = [];
  const isCurrentlySpecial = currentVerdict !== null;
  if (!previous.last_is_special && isCurrentlySpecial) {
    alerts.push("returned_to_special");
  } else if (previous.last_is_special && isCurrentlySpecial) {
    const lastNotifiedPrice = previous.last_notified_price === null
      ? Number.NaN
      : Number(previous.last_notified_price);
    const comparisonPrice = Number.isFinite(lastNotifiedPrice) && lastNotifiedPrice >= 0
      ? lastNotifiedPrice
      : Number(previous.last_price);
    const comparisonPriceCents = Math.round(comparisonPrice * 100);
    const minimumDropCents = Math.max(
      WATCHLIST_MIN_MEANINGFUL_PRICE_DROP_CENTS,
      Math.ceil(comparisonPriceCents * WATCHLIST_MIN_MEANINGFUL_PRICE_DROP_RATE),
    );
    if (comparisonPriceCents - currentPriceCents >= minimumDropCents) {
      alerts.push("better_special_price");
    }
  }

  // A null previous verdict is the migration/baseline state. Do not notify
  // when verdict tracking is first populated for an existing item.
  if (previous.last_verdict && currentVerdict && previous.last_verdict !== currentVerdict) {
    alerts.push("verdict_changed");
  }

  return alerts;
}

/** Backwards-compatible single-signal helper for callers that only need one. */
export function detectWatchlistPriceAlert(args: Parameters<typeof detectWatchlistAlerts>[0]): WatchlistAlertType | null {
  return detectWatchlistAlerts(args)[0] ?? null;
}
