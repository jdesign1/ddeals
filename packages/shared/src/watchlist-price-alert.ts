export type WatchlistVerdict = "GENUINE" | "DODGY" | "MARGINAL" | "UNKNOWN";
export type WatchlistAlertType =
  | "price_changed"
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
 * observation establishes a baseline and never alerts. Prices are compared
 * to the cent to avoid floating-point noise, while verdict changes require a
 * known previous and current verdict. The caller supplies freshness for both
 * observations so stale catalogue rows cannot create alerts.
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

  const previousPriceCents = Math.round(Number(previous.last_price) * 100);
  const currentPriceCents = Math.round(currentPrice * 100);
  const alerts: WatchlistAlertType[] = [];
  if (previousPriceCents !== currentPriceCents) alerts.push("price_changed");

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
