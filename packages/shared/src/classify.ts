/**
 * Canonical deal classifier — DODGY / REAL_SAVER / FAIR / UNKNOWN.
 *
 * This is a direct TypeScript port of `classifySpecial()` in
 * `Prototype/index.html` (ported 2026-08-07, matches formula as of commit
 * `b114686`). It must be kept in sync with the other three copies of this
 * formula — see the "Dodgy Deal / Fair Deal / Real Saver Classification
 * Formula" reference section in project.md, which now tracks FOUR synced
 * copies (this file, Prototype/index.html, dodgy_deals_view.sql,
 * analyser.py), not three. If you change a threshold or a rule here, update
 * project.md's reference section and the other three copies in the same
 * change.
 */

export type Verdict = "DODGY" | "REAL_SAVER" | "FAIR" | "UNKNOWN";

export interface PriceHistoryRow {
  scraped_at: string | Date;
  price: number | null;
  is_special: boolean;
  unit_price?: number | null;
  unit_label?: string | null;
}

export interface ClassifyResult {
  verdict: Verdict;
  reason: string;
  normalPrice: number | null;
  savingPct: number | null;
  saleStartedAt: Date | null;
}

export const LOOKBACK_DAYS = 30;
/** Minimum increase above the normal price before a special is called dodgy. */
export const MATERIAL_OVER_NORMAL_THRESHOLD = 5;
/** Backwards-compatible name for consumers that imported the old threshold. */
export const DODGY_THRESHOLD = MATERIAL_OVER_NORMAL_THRESHOLD;
/** Minimum repeated pre-sale lift required for a pump-and-discount signal. */
export const PUMP_INFLATION_THRESHOLD = 10;
/** % saving to count as a real saver */
export const REAL_SAVER_THRESHOLD = 10;
/** % saving floor for "fair" */
export const FAIR_THRESHOLD = 3;
/** min % the $/unit must actually drop */
export const SHRINKFLATION_THRESHOLD = 1;
/** Minimum regular observations needed before we publish a verdict. */
export const MIN_REGULAR_PRICE_SAMPLES = 3;
/** Minimum calendar span for those regular observations. */
export const MIN_REGULAR_HISTORY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Classifies one (product_id, store_id) current special using its own
 * price_history series (+ optional $/unit comparative pricing).
 *
 *   normal_price = median of pre-sale prices within the 30-day lookback
 *   inflate_pct  = how much price was pumped in the 7 days before the sale
 *   verdict, checked in order: UNKNOWN (insufficient evidence) / DODGY
 *   (material over-normal pricing, reliable shrinkflation, or repeated
 *   pump-and-discount) / REAL_SAVER (>=10% off) / FAIR (3-10% off, or
 *   nothing better established)
 *
 * saleUnitPrice/saleUnitLabel are the current special's own $/unit (e.g.
 * 5.00 / "per 1kg"), used only for the shrinkflation check in step 4.
 */
export function classifySpecial(
  salePrice: number,
  historyRows: PriceHistoryRow[],
  saleUnitPrice: number | null = null,
  saleUnitLabel: string | null = null
): ClassifyResult {
  const sorted = [...historyRows].sort(
    (a, b) => +new Date(a.scraped_at) - +new Date(b.scraped_at)
  );

  // Walk backwards while is_special=true to find when the current streak began.
  let saleStartedAt: Date | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].is_special) {
      saleStartedAt = new Date(sorted[i].scraped_at);
    } else {
      break;
    }
  }
  if (saleStartedAt === null) {
    return {
      verdict: "UNKNOWN",
      reason: "Not enough price history to judge",
      normalPrice: null,
      savingPct: null,
      saleStartedAt: null,
    };
  }

  const preSale = sorted.filter(
    (r) => !r.is_special && new Date(r.scraped_at) < saleStartedAt! && r.price != null
  );
  const lookbackCutoff = new Date(saleStartedAt.getTime() - LOOKBACK_DAYS * DAY_MS);
  const recentPreSale = preSale.filter((r) => new Date(r.scraped_at) >= lookbackCutoff);
  const recentSpanDays =
    recentPreSale.length > 1
      ? (new Date(recentPreSale[recentPreSale.length - 1].scraped_at).getTime() -
          new Date(recentPreSale[0].scraped_at).getTime()) /
        DAY_MS
      : 0;

  // A single regular scrape (or several scrapes from the same short window)
  // is not enough to distinguish a genuine normal price from a noisy scrape.
  // Keep the item neutral until there are at least three observations spread
  // across two weeks. This deliberately does not require a full 90-day
  // history: the longer history is an insight, while this is the minimum
  // evidence gate for a current deal verdict.
  if (
    recentPreSale.length < MIN_REGULAR_PRICE_SAMPLES ||
    recentSpanDays < MIN_REGULAR_HISTORY_DAYS
  ) {
    return {
      verdict: "UNKNOWN",
      reason: "Not enough price history to judge",
      normalPrice: null,
      savingPct: null,
      saleStartedAt,
    };
  }

  const normalPrice = median(recentPreSale.map((r) => r.price as number));

  const sevenDayCutoff = new Date(saleStartedAt.getTime() - 7 * DAY_MS);
  const veryEarly = preSale
    .filter((r) => new Date(r.scraped_at) < sevenDayCutoff)
    .map((r) => r.price as number);
  const preSaleRecent = preSale
    .filter((r) => new Date(r.scraped_at) >= sevenDayCutoff)
    .map((r) => r.price as number);
  let inflatePct = 0;
  if (veryEarly.length && preSaleRecent.length) {
    const baseline = median(veryEarly);
    const recentMedian = median(preSaleRecent);
    inflatePct = baseline && recentMedian ? ((recentMedian - baseline) / baseline) * 100 : 0;
  }

  const savingPct = normalPrice ? ((normalPrice - salePrice) / normalPrice) * 100 : 0;

  // Step 4 -- shrinkflation check. Only runs when both sides have a $/unit
  // figure under the SAME unit label (exact match: "$/kg" is never compared
  // to "$/100g") -- live coverage is ~16%, so this silently no-ops otherwise.
  let unitPriceChangePct: number | null = null;
  if (saleUnitPrice != null && saleUnitLabel) {
    const baselineUnitRows = preSale.filter(
      (r) => r.unit_price != null && r.unit_label === saleUnitLabel
    );
    if (baselineUnitRows.length >= 2) {
      const baselineUnitPrice = median(baselineUnitRows.map((r) => r.unit_price as number));
      if (baselineUnitPrice) {
        unitPriceChangePct = ((saleUnitPrice - baselineUnitPrice) / baselineUnitPrice) * 100;
      }
    }
  }

  if (normalPrice == null) {
    return {
      verdict: "UNKNOWN",
      reason: "Not enough price history to judge",
      normalPrice,
      savingPct: null,
      saleStartedAt,
    };
  }
  // A sale price that is equal to, or only slightly above, the normal price
  // is not automatically deceptive. Scrapes and retailer rounding can move
  // a price by a few percent, so reserve Dodgy for a material increase.
  if (salePrice > normalPrice * (1 + MATERIAL_OVER_NORMAL_THRESHOLD / 100)) {
    const reason = `Sale price ($${salePrice.toFixed(2)}) is ${(
      ((salePrice - normalPrice) / normalPrice) *
      100
    ).toFixed(1)}% above the normal price ($${normalPrice.toFixed(2)})`;
    return {
      verdict: "DODGY",
      reason,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
    };
  }
  if (unitPriceChangePct != null && unitPriceChangePct > -SHRINKFLATION_THRESHOLD) {
    return {
      verdict: "DODGY",
      reason: `Pack size shrank -- the $/unit price barely moved (${
        unitPriceChangePct >= 0 ? "+" : ""
      }${unitPriceChangePct.toFixed(1)}%) despite the nominal ${savingPct.toFixed(1)}% saving`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
    };
  }
  const repeatedLiftSamples =
    veryEarly.length > 0 && preSaleRecent.length >= 2
      ? preSaleRecent.filter((price) => {
          const baseline = median(veryEarly);
          return baseline != null && price >= baseline * (1 + PUMP_INFLATION_THRESHOLD / 100);
        }).length
      : 0;
  if (
    inflatePct >= PUMP_INFLATION_THRESHOLD &&
    repeatedLiftSamples >= 2 &&
    savingPct < FAIR_THRESHOLD
  ) {
    return {
      verdict: "DODGY",
      reason: `Price was raised ${inflatePct.toFixed(
        1
      )}% just before the sale -- you're only saving ${savingPct.toFixed(1)}%`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
    };
  }
  if (savingPct >= REAL_SAVER_THRESHOLD) {
    return {
      verdict: "REAL_SAVER",
      reason: `Saving ${savingPct.toFixed(1)}% vs the recent normal price`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
    };
  }
  if (savingPct >= FAIR_THRESHOLD) {
    return {
      verdict: "FAIR",
      reason: `Only a ${savingPct.toFixed(1)}% saving -- barely worth it`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
    };
  }
  return {
    verdict: "FAIR",
    reason: "Minimal saving vs normal price",
    normalPrice,
    savingPct: Math.round(savingPct * 10) / 10,
    saleStartedAt,
  };
}
