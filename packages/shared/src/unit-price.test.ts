import test from "node:test";
import assert from "node:assert/strict";
import { formatUnitPrice } from "./unit-price.ts";

test("formatUnitPrice formats retailer comparative labels", () => {
  assert.equal(formatUnitPrice(12.99, "$/kg"), "$12.99/kg");
  assert.equal(formatUnitPrice(3.49, "per 100g"), "$3.49/100g");
  assert.equal(formatUnitPrice(8.5, "L"), "$8.50/L");
  assert.equal(formatUnitPrice(2.99, "each"), "$2.99/each");
  assert.equal(formatUnitPrice(4.2, "per 1 kg"), "$4.20/kg");
  assert.equal(formatUnitPrice(1.1, "$ / 100ml"), "$1.10/100mL");
});

test("formatUnitPrice does not invent or display invalid comparisons", () => {
  assert.equal(formatUnitPrice(null, "$/kg"), null);
  assert.equal(formatUnitPrice(0, "$/kg"), null);
  assert.equal(formatUnitPrice(4.5, null), null);
  assert.equal(formatUnitPrice(4.5, "$ /"), null);
  assert.equal(formatUnitPrice(4.5, "per pack"), null);
  assert.equal(formatUnitPrice(4.5, "a retailer note"), null);
});
