import type { CurrentDeal } from "@dodgey-deals/shared";

export type DealFilter = "all" | "real" | "dodgy";

export const DEAL_FILTER_OPTIONS: { id: DealFilter; label: string }[] = [
  { id: "all", label: "All deals" },
  { id: "real", label: "Real Saver" },
  { id: "dodgy", label: "Dodgy Deal" },
];

/**
 * Shared by Check Deals and full-screen search so the Real Saver tab has one
 * definition everywhere: confirmed Real Deal assessments. Fair Price stays
 * available in All deals. The Dodgy tab also includes the deliberately narrow review band, while
 * those cards retain their unverified deal type and no confirmed-Dodgy badge.
 */
export function matchesDealFilter(deal: CurrentDeal, filter: DealFilter): boolean {
  if (deal.isOnSpecial === false) return false;
  if (filter === "all") return true;
  if (filter === "dodgy") return deal.dealType === "Dodgy Deal" || deal.isDodgyReviewCandidate === true;
  return deal.dealType === "Real Deal";
}
