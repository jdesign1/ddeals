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

test("DODGY when sale price is higher than the normal price (fake deal)", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -20), price: 3, is_special: false },
    { scraped_at: day(now, -10), price: 3, is_special: false },
    { scraped_at: day(now, -1), price: 5, is_special: true },
  ];
  const result = classifySpecial(5, rows);
  assert.equal(result.verdict, "DODGY");
  assert.match(result.reason, /HIGHER than the normal price/);
});

test("DODGY shrinkflation: nominal saving but $/unit barely moves", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
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
    { scraped_at: day(now, -3), price: 6, is_special: false }, // pumped within 7 days of sale
    { scraped_at: day(now, -1), price: 4.8, is_special: true },
  ];
  // normalPrice = median([5,5,5,6]) = 5, so 4.8 <= normalPrice (not a fake
  // deal); inflatePct = (6-5)/5*100 = 20% >= DODGY_THRESHOLD, savingPct = 4%
  // < REAL_SAVER_THRESHOLD -> pump-and-discount branch.
  const result = classifySpecial(4.8, rows);
  assert.equal(result.verdict, "DODGY");
  assert.match(result.reason, /raised/);
});

test("REAL_SAVER when saving is >= 10% with no dodgy signal", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
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
    { scraped_at: day(now, -20), price: 10, is_special: false },
    { scraped_at: day(now, -10), price: 10, is_special: false },
    { scraped_at: day(now, -1), price: 9.9, is_special: true },
  ];
  const result = classifySpecial(9.9, rows);
  assert.equal(result.verdict, "FAIR");
  assert.equal(result.reason, "Minimal saving vs normal price");
});
