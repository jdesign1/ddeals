import { ArrowDown, ArrowUp } from "lucide-react";
import { getPriceChange } from "@/lib/price-change";

export default function PriceChangeBadge({
  currentPrice,
  comparisonPrice,
  format = "percentage",
  compact = false,
  bare = false,
}: {
  currentPrice: number;
  comparisonPrice: number | null | undefined;
  /** Product-card footers use the same dollar-first language as Top 20. */
  format?: "percentage" | "amount";
  /** Keeps the saving chip alongside a verdict in narrow two-column cards. */
  compact?: boolean;
  /** Uses coloured text only, for dense card metadata such as Watchlist rows. */
  bare?: boolean;
}) {
  if (comparisonPrice == null) return null;
  const amount = Math.abs(comparisonPrice - currentPrice);
  if (!Number.isFinite(currentPrice) || !Number.isFinite(comparisonPrice) || amount < 0.005) return null;

  const change = format === "percentage" ? getPriceChange(currentPrice, comparisonPrice) : null;
  if (format === "percentage" && !change) return null;

  const isCheaper = comparisonPrice > currentPrice;
  const ChangeIcon = isCheaper ? ArrowDown : ArrowUp;
  const sizeClass = compact ? "text-xs leading-4 font-bold" : "dd-type-badge";
  const presentationClass = bare
    ? sizeClass
    : `${compact ? "rounded-md px-1 py-0.5" : "rounded-md p-1"} ${sizeClass} text-white shadow-xs`;
  const colorClass = isCheaper ? (bare ? "text-fair-600" : "bg-fair-600") : bare ? "text-alert-600" : "bg-alert-600";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 ${presentationClass} ${colorClass}`}
      aria-label={
        format === "amount"
          ? `${isCheaper ? "Save" : "Up"} $${amount.toFixed(2)} from the reference price`
          : `${change!.percentage}% ${isCheaper ? "below" : "above"} the reference price`
      }
    >
      {format === "amount" ? (
        <>
          {isCheaper ? "Save" : "Up"} ${amount.toFixed(2)}
        </>
      ) : (
        <>
          <ChangeIcon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
          {change!.percentage}%
        </>
      )}
    </span>
  );
}
