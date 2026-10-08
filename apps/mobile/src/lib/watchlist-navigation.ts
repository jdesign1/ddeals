const WATCHLIST_RETURN_VERSION = 1;
const WATCHLIST_RETURN_KEY = "dd-watchlist-return-v1";
const WATCHLIST_RETURN_MAX_AGE_MS = 15 * 60 * 1000;

export interface WatchlistReturnContext {
  version: typeof WATCHLIST_RETURN_VERSION;
  tab: "cheaper-options";
  expandedProductId: string;
  scrollTop: number;
  createdAt: number;
}

export function createWatchlistReturnContext(
  expandedProductId: string,
  scrollTop: number,
  createdAt = Date.now(),
): WatchlistReturnContext {
  return {
    version: WATCHLIST_RETURN_VERSION,
    tab: "cheaper-options",
    expandedProductId,
    scrollTop: Math.max(0, Math.round(scrollTop)),
    createdAt,
  };
}

export function saveWatchlistReturnContext(expandedProductId: string, scrollTop: number): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      WATCHLIST_RETURN_KEY,
      JSON.stringify(createWatchlistReturnContext(expandedProductId, scrollTop)),
    );
  } catch {
    // Navigation still works if session storage is unavailable.
  }
}

export function consumeWatchlistReturnContext(): WatchlistReturnContext | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(WATCHLIST_RETURN_KEY);
    window.sessionStorage.removeItem(WATCHLIST_RETURN_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WatchlistReturnContext>;
    const scrollTop = Number(parsed.scrollTop);
    const createdAt = Number(parsed.createdAt);
    const age = Date.now() - createdAt;
    if (
      parsed.version !== WATCHLIST_RETURN_VERSION ||
      parsed.tab !== "cheaper-options" ||
      typeof parsed.expandedProductId !== "string" ||
      !parsed.expandedProductId ||
      !Number.isFinite(scrollTop) ||
      scrollTop < 0 ||
      !Number.isFinite(createdAt) ||
      age > WATCHLIST_RETURN_MAX_AGE_MS
    ) {
      return null;
    }

    return createWatchlistReturnContext(parsed.expandedProductId, scrollTop, createdAt);
  } catch {
    return null;
  }
}
