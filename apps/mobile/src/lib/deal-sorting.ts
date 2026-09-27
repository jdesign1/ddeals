import type { CurrentDeal } from "@dodgey-deals/shared";
import { getDealConfidenceScore, getDealSnapshotAmount } from "@dodgey-deals/shared";
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

/**
 * Returns a sortable score for the existing sort sheet. Dollar amount is the
 * primary signal; confidence is scaled beneath it so it only breaks ties (or
 * near-ties) instead of allowing a weak, larger-looking percentage to win.
 */
export function getDealSortScore(deal: CurrentDeal, sortBy: CheckDealsSortBy): number | null {
  if (sortBy === "biggest-saver") {
    const savings = getDealSnapshotAmount(deal, "savings");
    return savings == null ? null : savings * 1_000 + getDealConfidenceScore(deal);
  }
  if (sortBy === "worst-dodgy") {
    const inflation = getDealSnapshotAmount(deal, "dodgy");
    return inflation == null ? null : inflation * 1_000 + getDealConfidenceScore(deal);
  }
  return null;
}
