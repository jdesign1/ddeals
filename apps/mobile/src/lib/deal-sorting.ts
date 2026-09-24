import type { CurrentDeal } from "@dodgey-deals/shared";
import { getSignedPriceChangePercentage } from "@/lib/price-change";
import type { DealFilter } from "@/lib/deal-filters";

export type CheckDealsSortBy = "price-asc" | "latest" | "biggest-saver" | "worst-dodgy";

/** The sort choices shared by the Check Deals rail and full-screen search. */
export const CHECK_DEALS_SORT_OPTIONS: { value: CheckDealsSortBy; label: string }[] = [
  { value: "price-asc", label: "Lowest to highest price" },
  { value: "latest", label: "Latest specials" },
  { value: "biggest-saver", label: "Biggest savers" },
  { value: "worst-dodgy", label: "Worst dodgy" },
];

/** Default ordering for each deal tab. The sort control remains available for
 * users who want a different order after the tab's useful default is applied. */
export function getDefaultDealSort(filter: DealFilter): CheckDealsSortBy {
  if (filter === "real") return "biggest-saver";
  if (filter === "dodgy") return "worst-dodgy";
  return "latest";
}

/** The verdict tab implied by the two verdict-specific sort choices. */
export function getDealFilterForSort(sortBy: CheckDealsSortBy): DealFilter | null {
  if (sortBy === "biggest-saver") return "real";
  if (sortBy === "worst-dodgy") return "dodgy";
  return null;
}

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
