import assert from "node:assert/strict";
import test from "node:test";
import type { CurrentDeal } from "./data.ts";
import {
  compareDealSnapshotEntries,
  getDealConfidenceLabel,
  getDealSnapshotAmount,
  isEligibleForDealSnapshot,
} from "./deal-ranking.ts";

function deal(overrides: Partial<CurrentDeal> = {}): CurrentDeal {
  return {
    price: 8,
    originalPrice: 10,
    dealType: "Real Deal",
    isOnSpecial: true,
    evidenceStatus: "SUFFICIENT",
    evidenceStrength: "STRONG",
    storeHistoryReady: true,
    regularHistoryDays: 30,
    ...overrides,
  } as CurrentDeal;
}

test("snapshot amount uses dollars below the reference price for savings", () => {
  assert.equal(getDealSnapshotAmount(deal({ price: 7.25, originalPrice: 10 }), "savings"), 2.75);
  assert.equal(getDealSnapshotAmount(deal({ price: 12, originalPrice: 10 }), "savings"), null);
});

test("snapshot amount uses dollars above the reference price for dodgy inflation", () => {
  assert.equal(getDealSnapshotAmount(deal({ price: 14, originalPrice: 10, dealType: "Dodgy Deal" }), "dodgy"), 4);
  assert.equal(getDealSnapshotAmount(deal({ price: 8, originalPrice: 10, dealType: "Dodgy Deal" }), "dodgy"), null);
});

test("absolute amount ranks ahead of confidence, with confidence breaking ties", () => {
  const largerSaving = { deal: deal({ price: 4, originalPrice: 10, evidenceStatus: "EARLY", evidenceStrength: "EARLY", storeHistoryReady: false, regularHistoryDays: 7 }) };
  const smallerSaving = { deal: deal({ price: 6, originalPrice: 10 }) };
  const equalSavingLowConfidence = { deal: deal({ price: 8, originalPrice: 10, evidenceStatus: "EARLY", evidenceStrength: "EARLY", storeHistoryReady: false, regularHistoryDays: 7 }) };
  const equalSavingHighConfidence = { deal: deal({ price: 8, originalPrice: 10 }) };

  assert.ok(compareDealSnapshotEntries(largerSaving, smallerSaving, "savings") < 0);
  assert.ok(compareDealSnapshotEntries(equalSavingHighConfidence, equalSavingLowConfidence, "savings") < 0);
});

test("only confirmed genuine savings and confirmed inflated dodgy deals enter the rails", () => {
  assert.equal(isEligibleForDealSnapshot(deal({ dealType: "Fair Price" }), "savings"), true);
  assert.equal(isEligibleForDealSnapshot(deal({ dealType: "Unverified Deal" }), "savings"), false);
  assert.equal(isEligibleForDealSnapshot(deal({ dealType: "Dodgy Deal", price: 13, originalPrice: 10 }), "dodgy"), true);
  assert.equal(isEligibleForDealSnapshot(deal({ dealType: "Dodgy Deal", price: 8, originalPrice: 10 }), "dodgy"), false);
});

test("confidence label reflects evidence strength", () => {
  assert.equal(getDealConfidenceLabel(deal()), "High confidence");
  assert.equal(
    getDealConfidenceLabel(deal({ evidenceStatus: "EARLY", evidenceStrength: "EARLY", storeHistoryReady: false, regularHistoryDays: 7 })),
    "Limited history"
  );
});
