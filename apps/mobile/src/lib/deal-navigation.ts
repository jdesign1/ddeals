import type { ProductCard } from "@dodgey-deals/shared";

const PRIMED_DEAL_TTL_MS = 30_000;
const MAX_PRIMED_DEALS = 8;

type RouterWithPrefetch = {
  prefetch: (href: string) => void | Promise<void>;
};

interface PrimedDeal {
  product: ProductCard;
  primedAt: number;
}

const primedDeals = new Map<string, PrimedDeal>();
const prefetchedDealRoutes = new Map<string, number>();

export function dealHref(productId: string, store: string): string {
  return `/deal/${encodeURIComponent(productId)}/${encodeURIComponent(store)}`;
}

function dealKey(productId: string, store: string): string {
  return `${productId}\u0000${store}`;
}

/**
 * Keeps the card's already-rendered product available for the next route.
 * This is deliberately short-lived and bounded: it is a navigation handoff,
 * not a second catalogue cache, and the deal page still validates/replaces it
 * with the current live catalogue in the background.
 */
export function primeDealProduct(product: ProductCard, store: string): void {
  const key = dealKey(product.id, store);
  primedDeals.delete(key);
  primedDeals.set(key, { product, primedAt: Date.now() });

  while (primedDeals.size > MAX_PRIMED_DEALS) {
    const oldestKey = primedDeals.keys().next().value;
    if (typeof oldestKey !== "string") break;
    primedDeals.delete(oldestKey);
  }
}

export function getPrimedDealProduct(productId: string, store: string): ProductCard | null {
  const key = dealKey(productId, store);
  const primed = primedDeals.get(key);
  if (!primed) return null;
  if (Date.now() - primed.primedAt > PRIMED_DEAL_TTL_MS) {
    primedDeals.delete(key);
    return null;
  }
  return primed.product;
}

/** Starts the route bundle fetch and primes the first paint for a deal handoff. */
export function prepareDealNavigation(
  router: RouterWithPrefetch,
  product: ProductCard,
  store: string,
): string {
  const href = dealHref(product.id, store);
  primeDealProduct(product, store);
  if (!prefetchedDealRoutes.has(href)) {
    prefetchedDealRoutes.set(href, Date.now());
    while (prefetchedDealRoutes.size > 32) {
      const oldestHref = prefetchedDealRoutes.keys().next().value;
      if (typeof oldestHref !== "string") break;
      prefetchedDealRoutes.delete(oldestHref);
    }
    void Promise.resolve(router.prefetch(href)).catch(() => {
      // Navigation remains correct if route prefetching is unavailable or fails.
      // Leave the route retryable if a later interaction needs it.
      prefetchedDealRoutes.delete(href);
    });
  }
  return href;
}
