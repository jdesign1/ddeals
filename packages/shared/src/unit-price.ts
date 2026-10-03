/**
 * Formats a retailer-provided comparative unit price for display.
 *
 * The catalogue's `sale_unit_label` is intentionally treated as a label,
 * not as a conversion instruction. We only clean the common `$ /` / `per`
 * prefixes; the numeric value remains the retailer's own comparative price.
 * This avoids inventing a unit price from an ambiguous pack-size string.
 */
export function formatUnitPrice(
  price: number | null | undefined,
  label: string | null | undefined,
): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0 || !label) return null;

  const unit = label
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\s*\$\s*\/?\s*/i, "")
    .replace(/^\s*per\s+/i, "")
    .replace(/^\s*\/\s*/, "")
    .trim();

  if (!unit || unit.length > 20 || /[\r\n]/.test(unit)) return null;
  return `$${price.toFixed(2)}/${unit}`;
}
