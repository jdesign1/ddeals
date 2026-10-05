/**
 * Formats a retailer-provided comparative unit price for display.
 *
 * The catalogue's `sale_unit_label` is intentionally treated as a label,
 * not as a conversion instruction. We only clean the common `$ /` / `per`
 * prefixes; the numeric value remains the retailer's own comparative price.
 * This avoids inventing a unit price from an ambiguous pack-size string.
 *
 * Keep this allow-list deliberately small. Unit prices are retained as
 * pricing evidence, but only selectively shown to shoppers on assessment
 * surfaces (see `shouldDisplayAssessmentUnitPrice` below).
 */

import { groupCategory } from "./deal-detail.ts";

const UNIT_LABELS = new Map([
  ["g", "g"],
  ["gram", "g"],
  ["grams", "g"],
  ["100g", "100g"],
  ["kg", "kg"],
  ["kilogram", "kg"],
  ["kilograms", "kg"],
  ["1kg", "kg"],
  ["ml", "mL"],
  ["millilitre", "mL"],
  ["millilitres", "mL"],
  ["milliliter", "mL"],
  ["milliliters", "mL"],
  ["100ml", "100mL"],
  ["l", "L"],
  ["litre", "L"],
  ["litres", "L"],
  ["liter", "L"],
  ["liters", "L"],
  ["1l", "L"],
  ["each", "each"],
  ["ea", "each"],
  ["item", "each"],
  ["items", "each"],
]);

function normalizeUnitLabel(label: string): string | null {
  const cleaned = label
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\s*\$\s*\/?\s*/i, "")
    .replace(/^\s*per\s+/i, "")
    .replace(/^\s*\/\s*/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  return UNIT_LABELS.get(cleaned) ?? null;
}

// Comparative pricing is most useful where shoppers can reasonably compare
// different pack sizes or weights. Beauty and personal-care products, for
// example, technically have a unit price but it adds little decision value.
const ALWAYS_COMPARABLE_CATEGORIES = new Set([
  "Fruit & Veg",
  "Meat & Poultry",
  "Fish & Seafood",
  "Fridge & Deli",
  "Dairy & Eggs",
  "Pets",
]);

const PANTRY_STAPLE_TERMS = /\b(?:almond(?:s)?|cashew(?:s)?|hazelnut(?:s)?|macadamia(?:s)?|peanut(?:s)?|pecan(?:s)?|pistachio(?:s)?|walnut(?:s)?|nut(?:s)?|seed(?:s)?|dried fruit|rice|pasta|cereal|oat(?:s|meal)?|flour|sugar|coffee|tea|cocoa|protein|powder|oil)\b/i;
const HOUSEHOLD_COMPARISON_TERMS = /\b(?:detergent|laundry|washing powder|dishwasher|dishwash|fabric softener|bleach|cleaner|cleaning|disinfectant)\b/i;
const READY_TO_DRINK_TERMS = /\b(?:drink|beverage|smooth(?:ie|ies)|kombucha|juice(?:\/drink)?|(?:vitamin|flavou?red|electrolyte|sparkling)\s+water|(?:energy|sports|soft|sparkling)\s+drink|protein\s+(?:shake|smooth(?:ie|ies)|drink|beverage)|(?:flavou?red|chocolate)\s+milk|milk\s+drink|iced\s+(?:coffee|tea)|cold\s+brew|(?:cola|lemonade|cordial|ginger\s+beer)\b)/i;
const DRY_DRINK_TERMS = /\b(?:coffee|tea|cocoa|chocolate)\b/i;

function isNonComparableBeverage(
  shopperCategory: string,
  category: string | null | undefined,
  productName: string,
): boolean {
  // Ready-to-drink products are already compared by their shelf price and
  // pack size. Unit pricing adds noise for these items, especially protein
  // shakes, smoothies, juice, water and soft drinks. Keep dry coffee/tea and
  // similar pantry staples eligible because their unit price is useful when
  // comparing pack sizes.
  if (shopperCategory === "Drinks" && !DRY_DRINK_TERMS.test(productName)) return true;

  const childCategories = (category || "")
    .split(">")
    .slice(1)
    .join(" ");
  if (/drink|beverage|juice|smooth(?:ie|ies)|kombucha|water/i.test(childCategories)) return true;

  return READY_TO_DRINK_TERMS.test(productName);
}

/**
 * Whether a retailer's comparative price is useful to show on a deal
 * assessment. This does not affect price history, deal classification, or
 * shrinkflation checks: those continue to retain every valid unit price.
 */
export function shouldDisplayAssessmentUnitPrice(
  category: string | null | undefined,
  productName: string | null | undefined,
  label: string | null | undefined,
): boolean {
  if (!label) return false;

  const unit = normalizeUnitLabel(label);
  if (!unit || unit === "each") return false;

  const shopperCategory = groupCategory(category, productName);
  const name = productName || "";
  if (isNonComparableBeverage(shopperCategory, category, name)) return false;
  if (ALWAYS_COMPARABLE_CATEGORIES.has(shopperCategory)) return true;

  if (shopperCategory === "Pantry") return PANTRY_STAPLE_TERMS.test(name);
  if (shopperCategory === "Household & Cleaning") return HOUSEHOLD_COMPARISON_TERMS.test(name);
  return false;
}

export function formatUnitPrice(
  price: number | null | undefined,
  label: string | null | undefined,
): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0 || !label) return null;

  const unit = normalizeUnitLabel(label);
  if (!unit) return null;
  return `$${price.toFixed(2)}/${unit}`;
}
