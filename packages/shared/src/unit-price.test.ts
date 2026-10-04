import test from "node:test";
import assert from "node:assert/strict";
import { formatUnitPrice, shouldDisplayAssessmentUnitPrice } from "./unit-price.ts";

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

test("assessment unit-price display stays focused on useful comparisons", () => {
  assert.equal(shouldDisplayAssessmentUnitPrice("Fruit & Veg", "Loose carrots", "$/kg"), true);
  assert.equal(shouldDisplayAssessmentUnitPrice("Meat, Poultry & Seafood > Chicken", "Chicken thighs", "per 100g"), true);
  assert.equal(shouldDisplayAssessmentUnitPrice("Fridge, Deli & Eggs", "Anchor milk", "$/L"), true);
  assert.equal(shouldDisplayAssessmentUnitPrice("Pantry", "Almonds", "$/100g"), true);
  assert.equal(shouldDisplayAssessmentUnitPrice("Pantry", "Potato chips", "$/100g"), false);
  assert.equal(shouldDisplayAssessmentUnitPrice("Household & Cleaning", "Laundry detergent", "$/L"), true);
  assert.equal(shouldDisplayAssessmentUnitPrice("Household & Cleaning", "Kitchen foil", "$/100g"), false);
  assert.equal(shouldDisplayAssessmentUnitPrice("Health & Body", "Nivea Creme", "$/100mL"), false);
  assert.equal(shouldDisplayAssessmentUnitPrice("Baby & Child", "Nappies", "$/each"), false);
  assert.equal(shouldDisplayAssessmentUnitPrice("Fruit & Veg", "Bananas", "per pack"), false);
});
