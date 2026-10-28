import { groupCategory, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";

const DODGY_RECENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MINIMUM_CATEGORY_SAMPLE = 20;
const CATEGORY_SAMPLE_SHARE = 0.015;
const CATEGORY_LIMIT = 4;
const PRICE_EQUALITY_EPSILON = 0.005;

export interface MarketWatchCategory {
  category: string;
  real: number;
  fair: number;
  dodgy: number;
  assessed: number;
  realPercentage: number;
  fairPercentage: number;
  dodgyPercentage: number;
  summary: string;
}

export interface MarketWatchStats {
  assessedOffers: number;
  realSavers: number;
  fairDeals: number;
  dodgyDeals: number;
  realSaversAtNinetyDayLow: number;
  realSaversAtNinetyDayLowPercentage: number;
  recentlyStartedDodgyDeals: number;
  topCategories: MarketWatchCategory[];
  updatedAt: string | null;
}

type AssessedDealKind = "real" | "fair" | "dodgy";

function assessedKind(deal: CurrentDeal): AssessedDealKind | null {
  if (!deal.isOnSpecial) return null;
  if (deal.dealType === "Real Deal") return "real";
  if (deal.dealType === "Fair Price") return "fair";
  if (deal.dealType === "Dodgy Deal") return "dodgy";
  return null;
}

function isAtNinetyDayLow(deal: CurrentDeal): boolean {
  return typeof deal.ninetyDayLow === "number"
    && Number.isFinite(deal.ninetyDayLow)
    && deal.price <= deal.ninetyDayLow + PRICE_EQUALITY_EPSILON;
}

function startedWithinLastWeek(deal: CurrentDeal, now: number): boolean {
  const startedAt = Date.parse(deal.saleStartedAt ?? "");
  return Number.isFinite(startedAt) && startedAt <= now && startedAt >= now - DODGY_RECENCY_WINDOW_MS;
}

function asPercentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function asCategory(category: string, counts: Pick<MarketWatchCategory, "real" | "fair" | "dodgy">): MarketWatchCategory {
  const assessed = counts.real + counts.fair + counts.dodgy;
  return {
    category,
    ...counts,
    assessed,
    realPercentage: asPercentage(counts.real, assessed),
    fairPercentage: asPercentage(counts.fair, assessed),
    dodgyPercentage: asPercentage(counts.dodgy, assessed),
    summary: `${counts.real} of ${assessed} assessed specials are Real Savers`,
  };
}

/**
 * Builds the market-wide, offer-level facts used by Market Watch. We count
 * assessed current offers rather than matched product groups: a special at
 * two supermarkets is two distinct shopping opportunities. Unverified rows
 * are deliberately absent from this output, so the UI never has to explain
 * missing history to a shopper.
 */
export function buildMarketWatchStats(products: readonly ProductCard[], now = Date.now()): MarketWatchStats {
  let realSavers = 0;
  let fairDeals = 0;
  let dodgyDeals = 0;
  let realSaversAtNinetyDayLow = 0;
  let recentlyStartedDodgyDeals = 0;
  let latestTimestamp = 0;
  const categoryCounts = new Map<string, Pick<MarketWatchCategory, "real" | "fair" | "dodgy">>();

  for (const product of products) {
    const category = groupCategory(product.category, product.name);
    for (const deal of product.currentDeals) {
      const kind = assessedKind(deal);
      if (!kind) continue;

      if (kind === "real") {
        realSavers += 1;
        if (isAtNinetyDayLow(deal)) realSaversAtNinetyDayLow += 1;
      } else if (kind === "fair") {
        fairDeals += 1;
      } else {
        dodgyDeals += 1;
        if (startedWithinLastWeek(deal, now)) recentlyStartedDodgyDeals += 1;
      }

      const current = categoryCounts.get(category) ?? { real: 0, fair: 0, dodgy: 0 };
      current[kind] += 1;
      categoryCounts.set(category, current);

      const observedAt = Date.parse(deal.scrapedAt ?? deal.specialsVerifiedAt ?? "");
      if (Number.isFinite(observedAt)) latestTimestamp = Math.max(latestTimestamp, observedAt);
    }
  }

  const assessedOffers = realSavers + fairDeals + dodgyDeals;
  const minimumCategorySample = Math.max(MINIMUM_CATEGORY_SAMPLE, Math.ceil(assessedOffers * CATEGORY_SAMPLE_SHARE));
  const categories = [...categoryCounts.entries()]
    .map(([category, counts]) => asCategory(category, counts))
    .filter((category) => category.assessed >= minimumCategorySample)
    .sort((left, right) => (
      right.realPercentage - left.realPercentage
      || right.assessed - left.assessed
      || left.category.localeCompare(right.category)
    ));

  return {
    assessedOffers,
    realSavers,
    fairDeals,
    dodgyDeals,
    realSaversAtNinetyDayLow,
    realSaversAtNinetyDayLowPercentage: asPercentage(realSaversAtNinetyDayLow, realSavers),
    recentlyStartedDodgyDeals,
    topCategories: categories.slice(0, CATEGORY_LIMIT),
    updatedAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : null,
  };
}
