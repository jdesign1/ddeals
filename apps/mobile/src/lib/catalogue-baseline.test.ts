import { test } from "node:test";
import assert from "node:assert/strict";
import type { CurrentDeal } from "@dodgey-deals/shared";
import { getActiveSpecialKey, isNewToCatalogueBaseline } from "./catalogue-baseline.ts";

function deal(overrides: Partial<CurrentDeal> = {}): CurrentDeal {
  return {
    store: "Woolworths NZ",
    price: 4,
    originalPrice: 5,
    discountPercentage: 20,
    dealType: "Real Deal",
    wasArtificiallyInflated: false,
    reason: "Genuine saving",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: "2026-09-28T00:00:00Z",
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

test("first launch treats the loaded catalogue as a baseline, not as new", () => {
  assert.equal(isNewToCatalogueBaseline("product-1", deal(), null), false);
});

test("an unchanged special remains known even when the catalogue refreshes", () => {
  const current = deal();
  const key = getActiveSpecialKey("product-1", current);
  assert.ok(key);
  assert.equal(isNewToCatalogueBaseline("product-1", current, new Set([key])), false);
});

test("a newly observed promotion is counted even when its sale start was earlier", () => {
  const lateArrival = deal({ saleStartedAt: "2026-09-20T00:00:00Z" });
  assert.equal(isNewToCatalogueBaseline("late-product", lateArrival, new Set()), true);
});

test("regular prices are never included in the active-special baseline", () => {
  assert.equal(getActiveSpecialKey("product-1", deal({ isOnSpecial: false })), null);
});
