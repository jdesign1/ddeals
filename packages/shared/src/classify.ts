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

export type EvidenceStatus = "SUFFICIENT" | "EARLY" | "INSUFFICIENT" | "LIMITED";
export type EvidenceStrength = "STRONG" | "DURATION_ONLY" | "EARLY" | "INSUFFICIENT";
export type StoreEvidencePolicy = "STANDARD" | "CONSERVATIVE";

export interface ClassifyResult {
  verdict: Verdict;
  reason: string;
  normalPrice: number | null;
  savingPct: number | null;
  saleStartedAt: Date | null;
  evidenceStatus: EvidenceStatus;
  evidenceStrength: EvidenceStrength;
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
/** A unit-price warning needs at least a fair-sized nominal saving to become Dodgy. */
export const MIN_MATERIAL_UNIT_SAVING_THRESHOLD = FAIR_THRESHOLD;
/** Repeated pre-sale lifts can still be deceptive below the real-saver threshold. */
export const PUMP_MAX_APPARENT_SAVING_THRESHOLD = REAL_SAVER_THRESHOLD;
/** min % the $/unit must actually drop */
export const SHRINKFLATION_THRESHOLD = 1;
/** Legacy row-count threshold retained for compatibility; duration is now the primary evidence signal. */
export const MIN_REGULAR_PRICE_SAMPLES = 3;
/** Minimum calendar span for those regular observations. */
export const MIN_REGULAR_HISTORY_DAYS = 14;
/** Legacy fallback row-count threshold retained for compatibility; duration is now the primary signal. */
export const EARLY_READ_MIN_REGULAR_PRICE_SAMPLES = 2;
/** Minimum fallback span before we can provide an indicative read. */
export const EARLY_READ_MIN_REGULAR_HISTORY_DAYS = 7;
/** Wider history window used only for an indicative read. */
export const EARLY_READ_LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pricesMatch(a: number | null | undefined, b: number | null | undefined): boolean {
  return a != null && b != null && Math.abs(a - b) < 0.005;
}

// Comparative labels such as 100g and 1kg can be safely normalized to the
// same base unit. A bare number is deliberately rejected because retailers
// use it for different things (for example sheets, wipes, or tea bags).
function parseComparativeUnitLabel(label: string | null | undefined): { baseQuantity: number; baseUnit: string } | null {
  const text = String(label ?? '').trim().toLowerCase()
    .replace(/^\$\s*\/\s*/, '')
    .replace(/^\/\s*/, '')
    .replace(/^per\s+/, '');
  const match = text.match(/^(\d+(?:\.\d+)?)?\s*(kg|g|l|ml|m|cm|mm|ea|each|sheets?|ss)$/i);
  if (!match) return null;
  const quantity = match[1] ? Number(match[1]) : 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const unit = match[2].toLowerCase() === 'each' ? 'ea'
    : /^(sheets?|ss)$/i.test(match[2]) ? 'sheet' : match[2].toLowerCase();
  const conversions: Record<string, { quantity: number; unit: string }> = {
    kg: { quantity: quantity * 1000, unit: 'g' },
    g: { quantity, unit: 'g' },
    l: { quantity: quantity * 1000, unit: 'ml' },
    ml: { quantity, unit: 'ml' },
    m: { quantity: quantity * 100, unit: 'cm' },
    cm: { quantity, unit: 'cm' },
    mm: { quantity: quantity / 10, unit: 'cm' },
    ea: { quantity, unit: 'ea' },
    sheet: { quantity, unit: 'sheet' },
  };
  const base = conversions[unit];
  return base && base.quantity > 0 ? { baseQuantity: base.quantity, baseUnit: base.unit } : null;
}

function normalizedComparativeUnitPrice(unitPrice: number | null | undefined, unitLabel: string | null | undefined): number | null {
  const value = Number(unitPrice);
  const basis = parseComparativeUnitLabel(unitLabel);
  if (!Number.isFinite(value) || value <= 0 || !basis) return null;
  return value / basis.baseQuantity;
}

/**
 * Classifies one (product_id, store_id) current special using its own
 * price_history series (+ optional $/unit comparative pricing).
 *
 *   normal_price = median of regular price spans overlapping the 30-day lookback
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
  saleUnitLabel: string | null = null,
  storeEvidencePolicy: StoreEvidencePolicy = "STANDARD"
): ClassifyResult {
  const sorted = [...historyRows].sort(
    (a, b) => +new Date(a.scraped_at) - +new Date(b.scraped_at)
  );

  // Walk backwards while is_special=true to find the current special streak.
  let specialStreakStartIndex: number | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].is_special) {
      specialStreakStartIndex = i;
    } else {
      break;
    }
  }
  if (specialStreakStartIndex === null) {
    return {
      verdict: "UNKNOWN",
      reason: "Not enough price history to judge",
      normalPrice: null,
      savingPct: null,
      saleStartedAt: null,
      evidenceStatus: "INSUFFICIENT",
      evidenceStrength: "INSUFFICIENT",
    };
  }

  // A retailer can flip only the special flag while leaving the price
  // unchanged. That is not a new price event, so find the first special row
  // in the contiguous current-price block. This prevents a one-day
  // same-price status row becoming the unit-price baseline without erasing
  // the start date when the special flag first appeared.
  let saleStartIndex = specialStreakStartIndex;
  while (saleStartIndex > 0 && pricesMatch(sorted[saleStartIndex - 1].price, salePrice)) {
    saleStartIndex -= 1;
  }
  while (saleStartIndex < specialStreakStartIndex && !sorted[saleStartIndex].is_special) {
    saleStartIndex += 1;
  }
  const saleStartedAt = new Date(sorted[saleStartIndex].scraped_at);

  const preSale = sorted.filter(
    (r) => !r.is_special && new Date(r.scraped_at) < saleStartedAt! && r.price != null
  );
  const lookbackCutoff = new Date(saleStartedAt.getTime() - LOOKBACK_DAYS * DAY_MS);
  const regularSpans = preSale.map((row) => {
    const start = new Date(row.scraped_at);
    const rowIndex = sorted.indexOf(row);
    const nextTimestamp = rowIndex >= 0 && sorted[rowIndex + 1]
      ? new Date(sorted[rowIndex + 1].scraped_at)
      : saleStartedAt;
    const end = nextTimestamp < saleStartedAt ? nextTimestamp : saleStartedAt;
    return { row, start, end };
  });
  const overlapDays = (start: Date, end: Date, cutoff: Date) =>
    Math.max(0, Math.min(end.getTime(), saleStartedAt.getTime()) - Math.max(start.getTime(), cutoff.getTime())) / DAY_MS;
  const recentRegularSpans = regularSpans.filter(({ start, end }) => end > lookbackCutoff && start < saleStartedAt);
  const recentRegularRows = recentRegularSpans.map(({ row }) => row);
  const recentRegularCoverageDays = recentRegularSpans.reduce(
    (total, { start, end }) => total + overlapDays(start, end, lookbackCutoff),
    0
  );

  const fallbackCutoff = new Date(saleStartedAt.getTime() - EARLY_READ_LOOKBACK_DAYS * DAY_MS);
  const fallbackRegularSpans = regularSpans.filter(({ start, end }) => end > fallbackCutoff && start < saleStartedAt);
  const fallbackPreSale = fallbackRegularSpans.map(({ row }) => row);
  const fallbackRegularCoverageDays = fallbackRegularSpans.reduce(
    (total, { start, end }) => total + overlapDays(start, end, fallbackCutoff),
    0
  );
  const hasRecentRegularAnchor = recentRegularSpans.length > 0;
  const hasLongRecentRegularSpan = recentRegularSpans.some(
    ({ start, end }) => overlapDays(start, end, lookbackCutoff) >= MIN_REGULAR_HISTORY_DAYS
  );
  const hasLongFallbackRegularSpan = fallbackRegularSpans.some(
    ({ start, end }) => overlapDays(start, end, fallbackCutoff) >= EARLY_READ_MIN_REGULAR_HISTORY_DAYS
  );
  const hasStrongRecentEvidence =
    recentRegularCoverageDays >= MIN_REGULAR_HISTORY_DAYS &&
    recentRegularRows.length >= MIN_REGULAR_PRICE_SAMPLES;
  const hasDurationOnlyRecentEvidence =
    recentRegularCoverageDays >= MIN_REGULAR_HISTORY_DAYS &&
    hasLongRecentRegularSpan;
  const hasSufficientRecentEvidence = hasStrongRecentEvidence || hasDurationOnlyRecentEvidence;
  const hasEarlyEvidence =
    !hasSufficientRecentEvidence &&
    hasRecentRegularAnchor &&
    fallbackRegularCoverageDays >= EARLY_READ_MIN_REGULAR_HISTORY_DAYS &&
    (hasLongFallbackRegularSpan || fallbackPreSale.length >= EARLY_READ_MIN_REGULAR_PRICE_SAMPLES);

  // A short-lived regular scrape is not enough to provide even an indicative
  // comparison. A long-held regular price can qualify on duration alone; a
  // wider 90-day fallback can provide an Early read, but it must never enter
  // the confirmed verdict branches below.
  if (!hasSufficientRecentEvidence) {
    if (hasEarlyEvidence) {
      const normalPrice = median(fallbackPreSale.map((r) => r.price as number));
      const savingPct = normalPrice ? ((normalPrice - salePrice) / normalPrice) * 100 : null;
      return {
        verdict: "UNKNOWN",
        reason: "Early read based on older regular prices -- more recent checks are needed to confirm this deal",
        normalPrice,
        savingPct: savingPct == null ? null : Math.round(savingPct * 10) / 10,
        saleStartedAt,
        evidenceStatus: "EARLY",
        evidenceStrength: "EARLY",
      };
    }
    return {
      verdict: "UNKNOWN",
      reason: "Not enough price history to judge",
      normalPrice: null,
      savingPct: null,
      saleStartedAt,
      evidenceStatus: "INSUFFICIENT",
      evidenceStrength: "INSUFFICIENT",
    };
  }

  const evidenceStrength: EvidenceStrength = hasStrongRecentEvidence ? "STRONG" : "DURATION_ONLY";
  const canPublishDirectionalVerdict =
    storeEvidencePolicy === "STANDARD" || evidenceStrength === "STRONG";

  const normalPrice = median(recentRegularRows.map((r) => r.price as number));

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

  // Step 4 -- unit-value check. Use the same recent/fallback evidence window
  // as the normal-price baseline and require either two observations with
  // seven days of coverage or one matching unit-price state held for 14 days.
  // A single short-lived status row must never be enough to accuse a retailer.
  let unitPriceChangePct: number | null = null;
  if (saleUnitPrice != null && saleUnitLabel) {
    const saleUnitBasis = parseComparativeUnitLabel(saleUnitLabel);
    const recentUnitSpans = recentRegularSpans.filter(
      ({ row }) => row.unit_price != null
        && saleUnitBasis != null
        && parseComparativeUnitLabel(row.unit_label)?.baseUnit === saleUnitBasis.baseUnit
    );
    const fallbackUnitSpans = fallbackRegularSpans.filter(
      ({ row }) => row.unit_price != null
        && saleUnitBasis != null
        && parseComparativeUnitLabel(row.unit_label)?.baseUnit === saleUnitBasis.baseUnit
    );
    const selectedUnitSpans = recentUnitSpans.length ? recentUnitSpans : fallbackUnitSpans;
    const baselineUnitRows = selectedUnitSpans.map(({ row }) => row);
    const selectedCutoff = selectedUnitSpans === recentUnitSpans ? lookbackCutoff : fallbackCutoff;
    const unitPriceSamples = baselineUnitRows.length;
    const unitPriceCoverageDays = selectedUnitSpans.reduce(
      (total, { start, end }) => total + overlapDays(start, end, selectedCutoff),
      0
    );
    const maxUnitSpanDays = selectedUnitSpans.reduce(
      (max, { start, end }) => Math.max(max, overlapDays(start, end, selectedCutoff)),
      0
    );
    const hasSufficientUnitEvidence =
      (unitPriceSamples >= 2 && unitPriceCoverageDays >= 7) || maxUnitSpanDays >= 14;
    if (hasSufficientUnitEvidence) {
      const baselineUnitPrices = baselineUnitRows
        .map((r) => normalizedComparativeUnitPrice(r.unit_price, r.unit_label))
        .filter((value): value is number => value != null);
      const normalizedSaleUnitPrice = normalizedComparativeUnitPrice(saleUnitPrice, saleUnitLabel);
      const baselineUnitPrice = median(baselineUnitPrices);
      if (normalizedSaleUnitPrice != null && baselineUnitPrice) {
        unitPriceChangePct = ((normalizedSaleUnitPrice - baselineUnitPrice) / baselineUnitPrice) * 100;
      }
    }
  }

  const repeatedLiftSamples =
    veryEarly.length > 0 && preSaleRecent.length >= 2
      ? preSaleRecent.filter((price) => {
          const baseline = median(veryEarly);
          return baseline != null && price >= baseline * (1 + PUMP_INFLATION_THRESHOLD / 100);
        }).length
      : 0;

  if (normalPrice == null) {
    return {
      verdict: "UNKNOWN",
      reason: "Not enough price history to judge",
      normalPrice,
      savingPct: null,
      saleStartedAt,
      evidenceStatus: "INSUFFICIENT",
      evidenceStrength,
    };
  }
  // A single long-held baseline can support a directional verdict when the
  // data spans the minimum duration. Conservative stores (for example New
  // World while its history is immature) still require stronger evidence.
  if (!canPublishDirectionalVerdict) {
    return {
      verdict: "UNKNOWN",
      reason: "Limited price history -- more independent regular prices are needed to confirm this deal",
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
      evidenceStatus: "LIMITED",
      evidenceStrength,
    };
  }

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
      evidenceStatus: "SUFFICIENT",
      evidenceStrength,
    };
  }
  if (
    unitPriceChangePct != null &&
    unitPriceChangePct > -SHRINKFLATION_THRESHOLD &&
    savingPct >= MIN_MATERIAL_UNIT_SAVING_THRESHOLD
  ) {
    return {
      verdict: "DODGY",
      reason: `Unit price barely moved (${unitPriceChangePct >= 0 ? "+" : ""}${unitPriceChangePct.toFixed(1)}%) despite the nominal ${savingPct.toFixed(1)}% saving`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
      evidenceStatus: "SUFFICIENT",
      evidenceStrength,
    };
  }
  if (
    inflatePct >= PUMP_INFLATION_THRESHOLD &&
    repeatedLiftSamples >= 2 &&
    repeatedLiftSamples === preSaleRecent.length &&
    savingPct < PUMP_MAX_APPARENT_SAVING_THRESHOLD
  ) {
    return {
      verdict: "DODGY",
      reason: `Price was raised ${inflatePct.toFixed(
        1
      )}% just before the sale -- you're only saving ${savingPct.toFixed(1)}%`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
      evidenceStatus: "SUFFICIENT",
      evidenceStrength,
    };
  }
  if (
    unitPriceChangePct != null &&
    unitPriceChangePct > -SHRINKFLATION_THRESHOLD &&
    savingPct > 0 &&
    savingPct < MIN_MATERIAL_UNIT_SAVING_THRESHOLD
  ) {
    return {
      verdict: "FAIR",
      reason: `Only a small saving (${savingPct.toFixed(1)}%) -- the price per ${saleUnitLabel} stayed about the same`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
      evidenceStatus: "SUFFICIENT",
      evidenceStrength,
    };
  }
  if (savingPct >= REAL_SAVER_THRESHOLD) {
    return {
      verdict: "REAL_SAVER",
      reason: `Saving ${savingPct.toFixed(1)}% vs the recent normal price`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
      evidenceStatus: "SUFFICIENT",
      evidenceStrength,
    };
  }
  if (savingPct >= FAIR_THRESHOLD) {
    return {
      verdict: "FAIR",
      reason: `Only a ${savingPct.toFixed(1)}% saving -- barely worth it`,
      normalPrice,
      savingPct: Math.round(savingPct * 10) / 10,
      saleStartedAt,
      evidenceStatus: "SUFFICIENT",
      evidenceStrength,
    };
  }
  return {
    verdict: "FAIR",
    reason: "Minimal saving vs normal price",
    normalPrice,
    savingPct: Math.round(savingPct * 10) / 10,
    saleStartedAt,
    evidenceStatus: "SUFFICIENT",
    evidenceStrength,
  };
}
