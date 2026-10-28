import type { UnreadListAlert } from "./notifications-context.tsx";

export interface WatchlistUpdateCopy {
  title: string;
  description: string;
  toneClass: string;
}

function formatPrice(value: number | null): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : null;
}

function priceChange(previousPrice: string | null, previousPriceValue: number | null, currentPrice: number): string {
  if (!previousPrice) return "";
  if (previousPriceValue != null && currentPrice < previousPriceValue) return ` Down from ${previousPrice}.`;
  if (previousPriceValue != null && currentPrice > previousPriceValue) return ` Up from ${previousPrice}.`;
  return "";
}

export function getWatchlistUpdateCopy(update: UnreadListAlert): WatchlistUpdateCopy {
  const price = formatPrice(update.price);
  const previousPrice = formatPrice(update.previous_price);
  const priceDescription = `${price ?? "The price changed"} at ${update.store_name}.`;

  if (update.event_type === "returned_to_special") {
    return {
      title: "Back on special",
      description: `${priceDescription}${priceChange(previousPrice, update.previous_price, update.price)}`,
      toneClass: "text-fair-700",
    };
  }
  if (update.event_type === "better_special_price") {
    return {
      title: "Price dropped",
      description: `${priceDescription}${priceChange(previousPrice, update.previous_price, update.price)}`,
      toneClass: "text-fair-700",
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
