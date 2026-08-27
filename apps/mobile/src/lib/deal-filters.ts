import type { CurrentDeal } from "@dodgey-deals/shared";

export type DealFilter = "all" | "real" | "dodgy";

export const DEAL_FILTER_OPTIONS: { id: DealFilter; label: string }[] = [
  { id: "all", label: "All Deals" },
  { id: "real", label: "Real Deals" },
  { id: "dodgy", label: "Dodgy" },
];

/**
 * Shared by Check Deals and full-screen search so the Real Deals tab has one
 * definition everywhere: confirmed Real Deal and Fair Price assessments.
 */
export function matchesDealFilter(deal: CurrentDeal, filter: DealFilter): boolean {
  if (deal.isOnSpecial === false) return false;
  if (filter === "all") return true;
  if (filter === "dodgy") return deal.dealType === "Dodgy Deal";
  return deal.dealType === "Real Deal" || deal.dealType === "Fair Price";
}
