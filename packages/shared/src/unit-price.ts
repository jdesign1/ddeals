/**
 * Formats a retailer-provided comparative unit price for display.
 *
 * The catalogue's `sale_unit_label` is intentionally treated as a label,
 * not as a conversion instruction. We only clean the common `$ /` / `per`
 * prefixes; the numeric value remains the retailer's own comparative price.
 * This avoids inventing a unit price from an ambiguous pack-size string.
 *
 * Keep this allow-list deliberately small. Unit prices are shown on several
 * surfaces, so accepting arbitrary retailer text would make the cards noisy
 * and could expose a label that is not meaningful to shoppers.
 */

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

export function formatUnitPrice(
  price: number | null | undefined,
  label: string | null | undefined,
): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0 || !label) return null;

  const unit = normalizeUnitLabel(label);
  if (!unit) return null;
  return `$${price.toFixed(2)}/${unit}`;
}
