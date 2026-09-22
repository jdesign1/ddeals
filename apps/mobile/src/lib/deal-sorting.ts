import type { CurrentDeal } from "@dodgey-deals/shared";
import { getSignedPriceChangePercentage } from "@/lib/price-change";

export type CheckDealsSortBy = "price-asc" | "latest" | "biggest-saver" | "worst-dodgy";

/** The sort choices shared by the Check Deals rail and full-screen search. */
export const CHECK_DEALS_SORT_OPTIONS: { value: CheckDealsSortBy; label: string }[] = [
  { value: "price-asc", label: "Lowest to highest price" },
  { value: "latest", label: "Latest specials" },
  { value: "biggest-saver", label: "Biggest savers" },
  { value: "worst-dodgy", label: "Worst dodgy" },
];

/** Returns a sortable score without rounding away small but real differences. */
export function getDealSortScore(deal: CurrentDeal, sortBy: CheckDealsSortBy): number | null {
  const signedPriceChange = getSignedPriceChangePercentage(deal.price, deal.originalPrice);
  if (signedPriceChange == null) return null;

  if (sortBy === "biggest-saver") return Math.max(0, signedPriceChange);
  if (sortBy === "worst-dodgy") {
    const dodgyPriority = deal.dealType === "Dodgy Deal" ? 1_000 : 0;
    return dodgyPriority + Math.max(0, -signedPriceChange);
  }
  return null;
}
