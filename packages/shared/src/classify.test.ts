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
  assert.equal(result.evidenceStrength, "DURATION_ONLY");
  assert.equal(result.normalPrice, 10);
});

test("duration-only evidence can publish a data-supported above-normal Dodgy verdict", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -60), price: 10, is_special: false },
    { scraped_at: day(now, -1), price: 12, is_special: true },
  ];
  const result = classifySpecial(12, rows);
  assert.equal(result.verdict, "DODGY");
  assert.equal(result.evidenceStatus, "SUFFICIENT");
  assert.equal(result.evidenceStrength, "DURATION_ONLY");
});

test("conservative store policy keeps duration-only savings neutral", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -60), price: 10, is_special: false },
    { scraped_at: day(now, -1), price: 8, is_special: true },
  ];
  const result = classifySpecial(8, rows, null, null, "CONSERVATIVE");
  assert.equal(result.verdict, "UNKNOWN");
  assert.equal(result.evidenceStatus, "LIMITED");
  assert.equal(result.evidenceStrength, "DURATION_ONLY");
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
  assert.match(result.reason, /Unit price barely moved/);
});

test("keeps tiny unit-price savings fair with user-friendly wording", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 5.5, is_special: false, unit_price: 5.5, unit_label: "100g" },
    { scraped_at: day(now, -20), price: 5.5, is_special: false, unit_price: 5.5, unit_label: "100g" },
    { scraped_at: day(now, -10), price: 5.5, is_special: false, unit_price: 5.5, unit_label: "100g" },
    { scraped_at: day(now, -1), price: 5.49, is_special: true },
  ];
  const result = classifySpecial(5.49, rows, 5.49, "100g");
  assert.equal(result.verdict, "FAIR");
  assert.match(result.reason, /Only a small saving \(0.2%\).*price per 100g stayed about the same/);
});

test("normalizes convertible unit labels before checking shrinkflation", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 10, is_special: false, unit_price: 0.50, unit_label: "100g" },
    { scraped_at: day(now, -20), price: 10, is_special: false, unit_price: 0.50, unit_label: "100g" },
    { scraped_at: day(now, -10), price: 10, is_special: false, unit_price: 0.50, unit_label: "100g" },
    { scraped_at: day(now, -1), price: 8, is_special: true },
  ];
  const result = classifySpecial(8, rows, 4, "1kg");
  assert.equal(result.verdict, "REAL_SAVER");
});

test("does not guess the meaning of a bare numeric unit label", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -30), price: 10, is_special: false, unit_price: 1.0, unit_label: "100" },
    { scraped_at: day(now, -20), price: 10, is_special: false, unit_price: 1.0, unit_label: "100" },
    { scraped_at: day(now, -10), price: 10, is_special: false, unit_price: 1.0, unit_label: "100" },
    { scraped_at: day(now, -1), price: 8, is_special: true },
  ];
  const result = classifySpecial(8, rows, 0.8, "100 sheets");
  assert.equal(result.verdict, "REAL_SAVER");
});

test("status-only special flip does not reset the price baseline", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -35), price: 5.69, is_special: false, unit_price: 0.57, unit_label: "100mL" },
    { scraped_at: day(now, -7), price: 4.50, is_special: true, unit_price: 0.45, unit_label: "100mL" },
    { scraped_at: day(now, -1), price: 4.50, is_special: false, unit_price: 0.45, unit_label: "100mL" },
    { scraped_at: day(now, 0), price: 4.50, is_special: true, unit_price: 0.45, unit_label: "100mL" },
  ];
  const result = classifySpecial(4.50, rows, 0.45, "100mL");
  assert.equal(result.verdict, "REAL_SAVER");
  assert.equal(result.saleStartedAt?.getTime(), rows[1].scraped_at instanceof Date ? rows[1].scraped_at.getTime() : new Date(rows[1].scraped_at).getTime());
  assert.doesNotMatch(result.reason, /Pack size shrank/);
});

test("one-day same-price unit baseline does not create a shrinkflation Dodgy verdict", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -31), price: 5.69, is_special: false, unit_price: 0.57, unit_label: "100mL" },
    { scraped_at: day(now, -2), price: 4.50, is_special: false, unit_price: 0.45, unit_label: "100mL" },
    { scraped_at: day(now, -1), price: 4.50, is_special: true, unit_price: 0.45, unit_label: "100mL" },
  ];
  const result = classifySpecial(4.50, rows, 0.45, "100mL");
  assert.notEqual(result.verdict, "DODGY");
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

test("DODGY pump-and-discount still catches a 5% apparent saving", () => {
  const now = new Date();
  const rows: PriceHistoryRow[] = [
    { scraped_at: day(now, -20), price: 5, is_special: false },
    { scraped_at: day(now, -19), price: 5, is_special: false },
    { scraped_at: day(now, -18), price: 5, is_special: false },
    { scraped_at: day(now, -6), price: 6, is_special: false },
    { scraped_at: day(now, -5), price: 6, is_special: false },
    { scraped_at: day(now, -4), price: 6, is_special: false },
    { scraped_at: day(now, -3), price: 6, is_special: false },
    { scraped_at: day(now, -1), price: 5.7, is_special: true },
  ];
  const result = classifySpecial(5.7, rows);
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
