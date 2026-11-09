import type { UnreadListAlert } from "./notifications-context.tsx";

export interface WatchlistUpdateCopy {
  title: string;
  description: string;
  toneClass: string;
}

export type WatchlistPriceDirection = "down" | "up" | null;

export interface WatchlistPriceChange {
  direction: WatchlistPriceDirection;
  currentPrice: string | null;
  previousPrice: string | null;
}

function formatPrice(value: number | null): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : null;
}

export function getWatchlistPriceChange(update: UnreadListAlert): WatchlistPriceChange {
  const direction = typeof update.previous_price === "number"
    ? update.price < update.previous_price
      ? "down"
      : update.price > update.previous_price
        ? "up"
        : null
    : null;
  return {
    direction,
    currentPrice: formatPrice(update.price),
    previousPrice: formatPrice(update.previous_price),
  };
}

function storeKey(update: UnreadListAlert): string {
  return update.store_name.trim().toLocaleLowerCase() || "unknown-store";
}

function updatePriority(update: UnreadListAlert): number {
  if (typeof update.previous_price === "number" && update.price !== update.previous_price) return 100;
  if (update.event_type === "verdict_changed" || update.event_type === "became_real_saver" || update.event_type === "became_dodgy") return 80;
  if (update.event_type === "returned_to_special" || update.event_type === "better_special_price" || update.event_type === "dodgy_special") return 60;
  return 10;
}

function updateTimestamp(update: UnreadListAlert): number {
  const timestamp = Date.parse(update.created_at);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function verdictLabel(verdict: UnreadListAlert["verdict"] | null): string {
  if (verdict === "GENUINE") return "Real Deal";
  if (verdict === "DODGY") return "Dodgy Deal";
  if (verdict === "MARGINAL") return "Fair Price";
  return "Unverified Deal";
}

export function getWatchlistUpdateCopy(update: UnreadListAlert): WatchlistUpdateCopy {
  const priceChange = getWatchlistPriceChange(update);
  const price = priceChange.currentPrice;
  const previousPrice = priceChange.previousPrice;
  const priceDescription = `${price ?? "The price was updated"} at ${update.store_name}.`;

  if (priceChange.direction === "down") {
    return {
      title: "Price dropped",
      description: previousPrice && price
        ? `Was ${previousPrice}, now dropped to ${price}.`
        : priceDescription,
      toneClass: "text-fair-700",
    };
  }

  if (priceChange.direction === "up") {
    return {
      title: "Price increased",
      description: previousPrice && price
        ? `Was ${previousPrice}, now increased to ${price}.`
        : priceDescription,
      toneClass: "text-alert-700",
    };
  }

  if (update.event_type === "returned_to_special") {
    return { title: "Back on special", description: priceDescription, toneClass: "text-fair-700" };
  }
  if (update.event_type === "better_special_price") {
    return { title: "Price dropped", description: priceDescription, toneClass: "text-fair-700" };
  }
  if (update.event_type === "price_changed") {
    return { title: "Price updated", description: priceDescription, toneClass: "text-stone-700" };
  }
  if (update.event_type === "verdict_changed") {
    return {
      title: "Deal verdict changed",
      description: `${verdictLabel(update.previous_verdict)} → ${verdictLabel(update.verdict)} at ${update.store_name}.`,
      toneClass: update.verdict === "DODGY" ? "text-alert-700" : "text-stone-700",
    };
  }
  if (update.event_type === "became_real_saver") {
    return {
      title: "Now a Real Saver",
      description: priceDescription,
      toneClass: "text-fair-700",
    };
  }
  if (update.event_type === "became_dodgy" || update.event_type === "dodgy_special") {
    return {
      title: "Now a Dodgy Deal",
      description: priceDescription,
      toneClass: "text-alert-700",
    };
  }
  return { title: "Deal updated", description: priceDescription, toneClass: "text-stone-700" };
}

/**
 * Keeps one useful update per supermarket. A price direction is more useful
 * than a generic status/verdict event, while newer events win ties.
 */
export function collapseWatchlistUpdates(updates: ReadonlyArray<UnreadListAlert>): UnreadListAlert[] {
  const byStore = new Map<string, UnreadListAlert>();
  for (const update of updates) {
    const key = storeKey(update);
    const current = byStore.get(key);
    if (!current || updatePriority(update) > updatePriority(current) || (
      updatePriority(update) === updatePriority(current)
      && updateTimestamp(update) > updateTimestamp(current)
    )) {
      byStore.set(key, update);
    }
  }
  return [...byStore.values()].sort((left, right) => updateTimestamp(right) - updateTimestamp(left));
}
