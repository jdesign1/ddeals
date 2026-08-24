import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySpecial, type PriceHistoryRow } from "./classify.ts";

// Helper: build a row N days before/after a reference date.
const day = (ref: Date, offset: number) => new Date(ref.getTime() + offset * 86_400_000);

test("UNKNOWN when there is no price history", () => {
  const result = classifySpecial(5, []);
  assert.equal(result.verdict, "UNKNOWN");
});

test("UNKNOWN when every row is a special (no pre-sale baseline)", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -2), price: 5, is_special: true },
    { scraped_at: day(now, -1), price: 5, is_special: true },
  ];
  const result = classifySpecial(5, rows);
  assert.equal(result.verdict, "UNKNOWN");
});

test("UNKNOWN when regular history is too shallow to judge", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -4), price: 5, is_special: false },
    { scraped_at: day(now, -1), price: 4, is_special: true },
  ];
  const result = classifySpecial(4, rows);
  assert.equal(result.verdict, "UNKNOWN");
  assert.equal(result.normalPrice, null);
});

test("EARLY when older regular history supports an indicative read but recent evidence is incomplete", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -80), price: 10, is_special: false },
    { scraped_at: day(now, -50), price: 9, is_special: true },
    { scraped_at: day(now, -5), price: 10, is_special: false },
    { scraped_at: day(now, -1), price: 8, is_special: true },
  ];
  const result = classifySpecial(8, rows);
  assert.equal(result.verdict, "UNKNOWN");
  assert.equal(result.evidenceStatus, "EARLY");
  assert.equal(result.normalPrice, 10);
  assert.equal(result.savingPct, 20);
});

test("REAL_SAVER when one regular price was held for at least 14 days before the sale", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -60), price: 10, is_special: false },
    { scraped_at: day(now, -1), price: 8, is_special: true },
  ];
  const result = classifySpecial(8, rows);
  assert.equal(result.verdict, "REAL_SAVER");
  assert.equal(result.evidenceStatus, "SUFFICIENT");
  assert.equal(result.normalPrice, 10);
});

test("DODGY when sale price is higher than the normal price (fake deal)", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 3, is_special: false },
    { scraped_at: day(now, -20), price: 3, is_special: false },
    { scraped_at: day(now, -10), price: 3, is_special: false },
    { scraped_at: day(now, -1), price: 5, is_special: true },
  ];
  const result = classifySpecial(5, rows);
  assert.equal(result.verdict, "DODGY");
  assert.match(result.reason, /above the normal price/);
});

test("FAIR when sale price exactly equals the normal price", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 5, is_special: false },
    { scraped_at: day(now, -20), price: 5, is_special: false },
    { scraped_at: day(now, -10), price: 5, is_special: false },
    { scraped_at: day(now, -1), price: 5, is_special: true },
  ];
  const result = classifySpecial(5, rows);
  assert.equal(result.verdict, "FAIR");
  assert.equal(result.savingPct, 0);
  assert.equal(result.reason, "Minimal saving vs normal price");
});

test("DODGY shrinkflation: nominal saving but $/unit barely moves", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 10, is_special: false, unit_price: 10, unit_label: "$/kg" },
    { scraped_at: day(now, -20), price: 10, is_special: false, unit_price: 10, unit_label: "$/kg" },
    { scraped_at: day(now, -10), price: 10, is_special: false, unit_price: 10, unit_label: "$/kg" },
    { scraped_at: day(now, -1), price: 8, is_special: true },
  ];
  // Sale unit price barely drops (< 1% threshold) despite a 20% nominal saving.
  const result = classifySpecial(8, rows, 9.95, "$/kg");
  assert.equal(result.verdict, "DODGY");
  assert.match(result.reason, /Pack size shrank/);
});

test("DODGY pump-and-discount: price raised just before sale, saving stays under real-saver threshold", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -20), price: 5, is_special: false },
    { scraped_at: day(now, -19), price: 5, is_special: false },
    { scraped_at: day(now, -18), price: 5, is_special: false },
    { scraped_at: day(now, -6), price: 6, is_special: false }, // repeated lift within 7 days of sale
    { scraped_at: day(now, -3), price: 6, is_special: false },
    { scraped_at: day(now, -1), price: 4.9, is_special: true },
  ];
  // The sale is only 2% below normal, while two recent regular observations
  // are 20% higher than the earlier baseline. That is enough repeated
  // evidence for the pump-and-discount rule.
  const result = classifySpecial(4.9, rows);
  assert.equal(result.verdict, "DODGY");
  assert.match(result.reason, /raised/);
});

test("FAIR when a single high scrape is not repeated evidence of a price pump", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 5, is_special: false },
    { scraped_at: day(now, -20), price: 5, is_special: false },
    { scraped_at: day(now, -10), price: 5, is_special: false },
    { scraped_at: day(now, -3), price: 6, is_special: false },
    { scraped_at: day(now, -1), price: 4.8, is_special: true },
  ];
  const result = classifySpecial(4.8, rows);
  assert.equal(result.verdict, "FAIR");
});

test("REAL_SAVER when saving is >= 10% with no dodgy signal", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 10, is_special: false },
    { scraped_at: day(now, -20), price: 10, is_special: false },
    { scraped_at: day(now, -10), price: 10, is_special: false },
    { scraped_at: day(now, -1), price: 8, is_special: true },
  ];
  const result = classifySpecial(8, rows);
  assert.equal(result.verdict, "REAL_SAVER");
  assert.equal(result.savingPct, 20);
});

test("FAIR when saving is between 3% and 10%", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 10, is_special: false },
    { scraped_at: day(now, -20), price: 10, is_special: false },
    { scraped_at: day(now, -10), price: 10, is_special: false },
    { scraped_at: day(now, -1), price: 9.5, is_special: true },
  ];
  const result = classifySpecial(9.5, rows);
  assert.equal(result.verdict, "FAIR");
  assert.equal(result.savingPct, 5);
});

test("FAIR when saving is minimal/negligible (below the fair floor, no dodgy signal)", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 10, is_special: false },
    { scraped_at: day(now, -20), price: 10, is_special: false },
    { scraped_at: day(now, -10), price: 10, is_special: false },
    { scraped_at: day(now, -1), price: 9.9, is_special: true },
  ];
  const result = classifySpecial(9.9, rows);
  assert.equal(result.verdict, "FAIR");
  assert.equal(result.reason, "Minimal saving vs normal price");
});
