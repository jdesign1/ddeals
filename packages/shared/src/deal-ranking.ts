import type { CurrentDeal } from "./data.ts";

export type DealSnapshotKind = "savings" | "dodgy";
export type DealConfidenceLabel = "High confidence" | "Moderate confidence" | "Limited history";

/**
 * Returns the dollar amount that a snapshot rail should rank and display.
 * Savings use the gap below the reference price; dodgy specials use the gap
 * above it, so a large inflated price cannot hide behind a small percentage.
 */
export function getDealSnapshotAmount(deal: Pick<CurrentDeal, "price" | "originalPrice">, kind: DealSnapshotKind): number | null {
  if (!Number.isFinite(deal.price) || !Number.isFinite(deal.originalPrice) || deal.originalPrice <= 0) return null;
  const amount = kind === "savings" ? deal.originalPrice - deal.price : deal.price - deal.originalPrice;
  return amount > 0 ? amount : null;
}

/**
 * Confidence is deliberately a secondary score. A smaller, well-supported
 * saving should not outrank a materially larger saving, but equal or nearly
 * equal amounts should favour the stronger evidence.
 */
export function getDealConfidenceScore(deal: Pick<CurrentDeal, "evidenceStatus" | "evidenceStrength" | "storeHistoryReady" | "regularHistoryDays">): number {
  let score = 0;

  if (deal.evidenceStatus === "SUFFICIENT") score += 4;
  else if (deal.evidenceStatus === "LIMITED") score += 2;
  else if (deal.evidenceStatus === "EARLY") score += 1;

  if (deal.evidenceStrength === "STRONG") score += 2;
  else if (deal.evidenceStrength === "DURATION_ONLY") score += 1;

  if (deal.storeHistoryReady === true) score += 1;
  if ((deal.regularHistoryDays ?? 0) >= 14) score += 1;
  if ((deal.regularHistoryDays ?? 0) >= 30) score += 1;

  return score;
}

export function getDealConfidenceLabel(deal: Pick<CurrentDeal, "evidenceStatus" | "evidenceStrength" | "storeHistoryReady" | "regularHistoryDays">): DealConfidenceLabel {
  const score = getDealConfidenceScore(deal);
  if (score >= 7) return "High confidence";
  if (score >= 3) return "Moderate confidence";
  return "Limited history";
}

export function isEligibleForDealSnapshot(deal: CurrentDeal, kind: DealSnapshotKind): boolean {
  if (!deal.isOnSpecial || getDealSnapshotAmount(deal, kind) == null) return false;
  if (kind === "savings") return deal.dealType === "Real Deal" || deal.dealType === "Fair Price";
  return deal.dealType === "Dodgy Deal";
}

export function compareDealSnapshotEntries(
  a: { deal: CurrentDeal },
  b: { deal: CurrentDeal },
  kind: DealSnapshotKind
): number {
  const amountDifference = (getDealSnapshotAmount(b.deal, kind) ?? Number.NEGATIVE_INFINITY)
    - (getDealSnapshotAmount(a.deal, kind) ?? Number.NEGATIVE_INFINITY);
  if (amountDifference !== 0) return amountDifference;

  return getDealConfidenceScore(b.deal) - getDealConfidenceScore(a.deal);
}
