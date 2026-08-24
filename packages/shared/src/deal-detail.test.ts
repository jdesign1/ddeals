import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPriceHistoryInsights,
  getAssessmentVerdict,
  getStoreProductUrl,
  MIN_90D_SAMPLES_FOR_INSIGHTS,
} from "./deal-detail.ts";
import type { CurrentDeal } from "./data.ts";

// Minimal real-shaped CurrentDeal fixture -- only the ninetyDay* fields
// matter for buildPriceHistoryInsights, everything else just needs to
// typecheck.
function fakeDeal(overrides: Partial<CurrentDeal> = {}): CurrentDeal {
  return {
    store: "Woolworths",
    price: 5,
    originalPrice: 7,
    discountPercentage: 29,
    dealType: "Real Deal",
    wasArtificiallyInflated: false,
    reason: "Genuine Sale",
    explanation: "Saving 28.6% vs recent normal price",
    isOnSpecial: true,
    saleStartedAt: "2026-08-01T00:00:00Z",
    specialEndDate: null,
    ninetyDayLow: null,
    ninetyDayHigh: null,
    ninetyDayAvg: null,
    ninetyDaySamples: null,
    ninetyDaySpecialSamples: null,
    ninetyDayDaysTracked: null,
    ninetyDaySpecialDays: null,
    ...overrides,
  };
}

test("getStoreProductUrl: uses Woolworths NZ's live product search route", () => {
  assert.equal(
    getStoreProductUrl("Woolworths NZ", "Macro Organic Soy Milk Light 1l"),
    "https://www.woolworths.co.nz/shop/searchproducts?search=Macro%20Organic%20Soy%20Milk%20Light%201l"
  );
});

test("getAssessmentVerdict: keeps an unverified special neutral instead of calling it fair", () => {
  assert.equal(getAssessmentVerdict(fakeDeal({ dealType: "Unverified Deal" })), "Still checking");
  assert.equal(getAssessmentVerdict(fakeDeal({ dealType: "Unverified Deal", isOnSpecial: false })), "Fair Deal");
});

test("buildPriceHistoryInsights: returns 4 insights (low/high/avg/frequency) when there's enough real 90-day history", () => {
  const deal = fakeDeal({
    ninetyDayLow: 4.5,
    ninetyDayHigh: 8.0,
    ninetyDayAvg: 6.25,
    ninetyDaySamples: 30,
    ninetyDaySpecialSamples: 8,
    ninetyDayDaysTracked: 90,
    ninetyDaySpecialDays: 24,
  });
  const insights = buildPriceHistoryInsights(deal);
  assert.equal(insights.length, 4);
  assert.deepEqual(
    insights.map((i) => i.key),
    ["low", "high", "avg", "frequency"]
  );
  assert.equal(insights[0].value, "$4.50");
  assert.equal(insights[1].value, "$8.00");
  assert.equal(insights[2].value, "$6.25");
  // round(24/90*100) = 27 -> falls in the 15-39 "Occasional" band
  // Copy simplified 2026-08-21, per Jay's "4th tile is a bit packed" ask --
  // label is now "" (the caption's old "On special" wording folded into
  // the tier phrase itself), tier text reads "X on special" not "X
  // Discounted", and detail reads "X times in the last Y days" not "X of
  // the last Y days tracked".
  // Tier text changed again same day, per Jay: "Occasional special,
  // Frequent special, Rare special" -- see `frequencyTierLabel`'s own doc
  // comment in deal-detail.ts.
  // Detail reworded again same day (follow-up ask): "X times in the last Y
  // days" -> "X times in Y days" (dropped "the last") -- see
  // `buildPriceHistoryInsights`'s own doc comment in deal-detail.ts for the
  // exact Jay quote this matches.
  assert.equal(insights[3].label, "");
  assert.equal(insights[3].value, "Occasional special");
  assert.equal(insights[3].detail, "24 times in 90 days");
});

test("buildPriceHistoryInsights: 'never discounted' (0 special days) is a real result, not treated as missing data", () => {
  const deal = fakeDeal({
    ninetyDayLow: 5,
    ninetyDayHigh: 5,
    ninetyDayAvg: 5,
    ninetyDaySamples: 12,
    ninetyDaySpecialSamples: 0,
    ninetyDayDaysTracked: 90,
    ninetyDaySpecialDays: 0,
  });
  const insights = buildPriceHistoryInsights(deal);
  assert.equal(insights.length, 4);
  const frequency = insights.find((i) => i.key === "frequency");
  assert.equal(frequency?.value, "Never on special");
  assert.equal(frequency?.detail, "0 times in 90 days");
});

test("buildPriceHistoryInsights: frequency tier is duration-weighted, not the old row-count -- a single recent transition doesn't read as 100%", () => {
  // Regression case for the 2026-08-20 fix: product went on special 5 days
  // ago, no price change since -- one transition row in the window, but
  // only 5 of 90 tracked days actually discounted. The pre-fix event-count
  // logic would have shown "100% of checks"/"Frequently Discounted" here.
  const deal = fakeDeal({
    ninetyDayLow: 5,
    ninetyDayHigh: 6,
    ninetyDaySamples: 3,
    ninetyDaySpecialSamples: 1,
    ninetyDayAvg: 5.5,
    ninetyDayDaysTracked: 90,
    ninetyDaySpecialDays: 5,
  });
  const frequency = buildPriceHistoryInsights(deal).find((i) => i.key === "frequency");
  assert.equal(frequency?.value, "Rare special");
  assert.equal(frequency?.detail, "5 times in 90 days");
});

test("buildPriceHistoryInsights: frequency tier boundaries (14/15% and 39/40%, not off-by-one)", () => {
  const base = { ninetyDayLow: 5, ninetyDayHigh: 6, ninetyDayAvg: 5.5, ninetyDaySamples: 5, ninetyDaySpecialSamples: 1 };
  const tierFor = (specialDays: number) =>
    buildPriceHistoryInsights(
      fakeDeal({ ...base, ninetyDayDaysTracked: 100, ninetyDaySpecialDays: specialDays })
    ).find((i) => i.key === "frequency")?.value;

  assert.equal(tierFor(14), "Rare special");
  assert.equal(tierFor(15), "Occasional special");
  assert.equal(tierFor(39), "Occasional special");
  assert.equal(tierFor(40), "Frequent special");
});

test("buildPriceHistoryInsights: returns [] when ninetyDaySamples is null (no history in the 90-day window)", () => {
  const deal = fakeDeal();
  assert.deepEqual(buildPriceHistoryInsights(deal), []);
});

test("buildPriceHistoryInsights: returns [] when the duration-weighted fields aren't populated yet, even with real low/high/avg/samples present -- covers the pre-20260820-migration/pre-select= rollout window", () => {
  const deal = fakeDeal({
    ninetyDayLow: 5,
    ninetyDayHigh: 6,
    ninetyDayAvg: 5.5,
    ninetyDaySamples: 30,
    ninetyDaySpecialSamples: 8,
    ninetyDayDaysTracked: null,
    ninetyDaySpecialDays: null,
  });
  assert.deepEqual(buildPriceHistoryInsights(deal), []);
});

test(`buildPriceHistoryInsights: returns [] below the ${MIN_90D_SAMPLES_FOR_INSIGHTS}-sample floor, even with real low/high/avg present`, () => {
  const deal = fakeDeal({
    ninetyDayLow: 5,
    ninetyDayHigh: 6,
    ninetyDayAvg: 5.5,
    ninetyDaySamples: MIN_90D_SAMPLES_FOR_INSIGHTS - 1,
    ninetyDaySpecialSamples: 1,
    ninetyDayDaysTracked: 90,
    ninetyDaySpecialDays: 1,
  });
  assert.deepEqual(buildPriceHistoryInsights(deal), []);
});

test(`buildPriceHistoryInsights: returns insights right at the ${MIN_90D_SAMPLES_FOR_INSIGHTS}-sample floor (boundary, not off-by-one)`, () => {
  const deal = fakeDeal({
    ninetyDayLow: 5,
    ninetyDayHigh: 6,
    ninetyDayAvg: 5.5,
    ninetyDaySamples: MIN_90D_SAMPLES_FOR_INSIGHTS,
    ninetyDaySpecialSamples: 1,
    ninetyDayDaysTracked: 90,
    ninetyDaySpecialDays: 1,
  });
  assert.equal(buildPriceHistoryInsights(deal).length, 4);
});
