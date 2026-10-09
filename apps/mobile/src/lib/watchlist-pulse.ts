export type WatchlistPulseKind =
  | "real-savers"
  | "dodgy-deals"
  | "back-on-special"
  | "price-drops"
  | "cheaper-elsewhere";

export interface WatchlistPulseOffer {
  storeId: string | null | undefined;
  price: number;
}

export interface WatchlistPulseProduct {
  productId: string;
  verdicts: readonly string[];
  offers: readonly WatchlistPulseOffer[];
}

export interface WatchlistPulseAlert {
  productId: string;
  eventType: string;
}

export interface WatchlistPulseSummary {
  counts: Record<WatchlistPulseKind, number>;
  productIds: Record<WatchlistPulseKind, ReadonlySet<string>>;
}

const PULSE_KINDS: readonly WatchlistPulseKind[] = [
  "real-savers",
  "dodgy-deals",
  "back-on-special",
  "price-drops",
  "cheaper-elsewhere",
];

function emptyProductSets(): Record<WatchlistPulseKind, Set<string>> {
  return Object.fromEntries(PULSE_KINDS.map((kind) => [kind, new Set<string>()])) as Record<WatchlistPulseKind, Set<string>>;
}

/**
 * Builds the Watchlist Pulse from unique products, not supermarket offers.
 * Event-based counts intentionally use unread alert events: the pulse is a
 * return-visit summary, and viewing the corresponding Watchlist item clears
 * the same alert that powers the existing red "New" marker. The cheaper-
 * elsewhere signal is anchored to the card's first/current offer and only
 * fires for a lower exact price at another supermarket; saved-store
 * provenance is not currently part of list membership.
 */
export function buildWatchlistPulse(
  products: readonly WatchlistPulseProduct[],
  alerts: readonly WatchlistPulseAlert[],
): WatchlistPulseSummary {
  const productIds = emptyProductSets();
  const watchedProductIds = new Set<string>();

  for (const product of products) {
    const productId = product.productId.trim();
    if (!productId) continue;
    watchedProductIds.add(productId);

    if (product.verdicts.includes("Real Saver")) productIds["real-savers"].add(productId);
    if (product.verdicts.includes("Dodgy Deal")) productIds["dodgy-deals"].add(productId);

    const displayedOffer = product.offers[0];
    const displayedPrice = displayedOffer?.price;
    const displayedStore = displayedOffer?.storeId;
    const hasCheaperDifferentStore = product.offers.some(
      (offer, index) => index > 0
        && Boolean(displayedStore)
        && Boolean(offer.storeId)
        && offer.storeId !== displayedStore
        && Number.isFinite(offer.price)
        && Number.isFinite(displayedPrice)
        && offer.price < Number(displayedPrice),
    );
    if (hasCheaperDifferentStore) {
      // The first offer is the price currently shown on the Watchlist card.
      // Compare it with the lowest exact per-store offer; the UI will show
      // the stores and prices when the filtered product is opened.
      productIds["cheaper-elsewhere"].add(productId);
    }
  }

  const uniqueEvents = new Set<string>();
  for (const alert of alerts) {
    const productId = alert.productId.trim();
    if (!productId || !watchedProductIds.has(productId)) continue;
    const eventKey = `${alert.eventType}:${productId}`;
    if (uniqueEvents.has(eventKey)) continue;
    uniqueEvents.add(eventKey);
    if (alert.eventType === "returned_to_special") productIds["back-on-special"].add(productId);
    if (alert.eventType === "better_special_price") productIds["price-drops"].add(productId);
  }

  const counts = Object.fromEntries(
    PULSE_KINDS.map((kind) => [kind, productIds[kind].size]),
  ) as Record<WatchlistPulseKind, number>;

  return { counts, productIds };
}
