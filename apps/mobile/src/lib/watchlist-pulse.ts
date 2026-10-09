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

export interface WatchlistPulseVerdictOffer {
  storeId: string | null | undefined;
  verdict: string;
}

export interface WatchlistPulseProduct {
  productId: string;
  verdicts: readonly string[];
  offers: readonly WatchlistPulseOffer[];
  verdictOffers?: readonly WatchlistPulseVerdictOffer[];
}

export interface WatchlistPulseAlert {
  productId: string;
  eventType: string;
}

export interface WatchlistPulseSummary {
  counts: Record<WatchlistPulseKind, number>;
  productIds: Record<WatchlistPulseKind, ReadonlySet<string>>;
  preferredStoreIds: Record<WatchlistPulseKind, ReadonlyMap<string, string>>;
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

function emptyPreferredStores(): Record<WatchlistPulseKind, Map<string, string>> {
  return Object.fromEntries(PULSE_KINDS.map((kind) => [kind, new Map<string, string>()])) as Record<WatchlistPulseKind, Map<string, string>>;
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
  const preferredStoreIds = emptyPreferredStores();
  const watchedProductIds = new Set<string>();

  const addProduct = (kind: WatchlistPulseKind, productId: string, storeId?: string | null) => {
    productIds[kind].add(productId);
    if (storeId && !preferredStoreIds[kind].has(productId)) preferredStoreIds[kind].set(productId, storeId);
  };

  for (const product of products) {
    const productId = product.productId.trim();
    if (!productId) continue;
    watchedProductIds.add(productId);

    if (product.verdictOffers?.length) {
      for (const offer of product.verdictOffers) {
        if (offer.verdict === "Real Saver") addProduct("real-savers", productId, offer.storeId);
        if (offer.verdict === "Dodgy Deal") addProduct("dodgy-deals", productId, offer.storeId);
      }
    } else {
      // Keep the pure helper backwards-compatible for callers that only have
      // product-level verdicts. The page supplies verdictOffers so a tapped
      // pulse can still select the supermarket that produced the verdict.
      const firstStoreId = product.offers[0]?.storeId;
      if (product.verdicts.includes("Real Saver")) addProduct("real-savers", productId, firstStoreId);
      if (product.verdicts.includes("Dodgy Deal")) addProduct("dodgy-deals", productId, firstStoreId);
    }

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
      addProduct("cheaper-elsewhere", productId, displayedStore);
    }
  }

  const uniqueEvents = new Set<string>();
  for (const alert of alerts) {
    const productId = alert.productId.trim();
    if (!productId || !watchedProductIds.has(productId)) continue;
    const eventKey = `${alert.eventType}:${productId}`;
    if (uniqueEvents.has(eventKey)) continue;
    uniqueEvents.add(eventKey);
    if (alert.eventType === "returned_to_special") addProduct("back-on-special", productId);
    if (alert.eventType === "better_special_price") addProduct("price-drops", productId);
  }

  const counts = Object.fromEntries(
    PULSE_KINDS.map((kind) => [kind, productIds[kind].size]),
  ) as Record<WatchlistPulseKind, number>;

  return { counts, productIds, preferredStoreIds };
}
