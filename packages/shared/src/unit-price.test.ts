import test from "node:test";
import assert from "node:assert/strict";
import { formatUnitPrice } from "./unit-price.ts";

test("formatUnitPrice formats retailer comparative labels", () => {
  assert.equal(formatUnitPrice(12.99, "$/kg"), "$12.99/kg");
  assert.equal(formatUnitPrice(3.49, "per 100g"), "$3.49/100g");
  assert.equal(formatUnitPrice(8.5, "L"), "$8.50/L");
  assert.equal(formatUnitPrice(2.99, "each"), "$2.99/each");
});

test("formatUnitPrice does not invent or display invalid comparisons", () => {
  assert.equal(formatUnitPrice(null, "$/kg"), null);
  assert.equal(formatUnitPrice(0, "$/kg"), null);
  assert.equal(formatUnitPrice(4.5, null), null);
  assert.equal(formatUnitPrice(4.5, "$ /"), null);
});
