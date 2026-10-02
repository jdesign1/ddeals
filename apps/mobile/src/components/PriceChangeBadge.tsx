import { ArrowDown, ArrowUp } from "lucide-react";
import { getPriceChange } from "@/lib/price-change";

export default function PriceChangeBadge({
  currentPrice,
  comparisonPrice,
  format = "percentage",
  compact = false,
}: {
  currentPrice: number;
  comparisonPrice: number | null | undefined;
  /** Product-card footers use the same dollar-first language as Top 20. */
  format?: "percentage" | "amount";
  /** Keeps the saving chip alongside a verdict in narrow two-column cards. */
  compact?: boolean;
}) {
  if (comparisonPrice == null) return null;
  const amount = Math.abs(comparisonPrice - currentPrice);
  if (!Number.isFinite(currentPrice) || !Number.isFinite(comparisonPrice) || amount < 0.005) return null;

  const change = format === "percentage" ? getPriceChange(currentPrice, comparisonPrice) : null;
  if (format === "percentage" && !change) return null;

  const isCheaper = comparisonPrice > currentPrice;
  const ChangeIcon = isCheaper ? ArrowDown : ArrowUp;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md text-white shadow-xs ${
        compact ? "px-1 py-0.5 text-[11px] leading-4" : "p-1 dd-type-badge"
      } ${
        isCheaper ? "bg-fair-600" : "bg-alert-600"
      }`}
      aria-label={
        format === "amount"
          ? `${isCheaper ? "Save" : "Risen"} $${amount.toFixed(2)} from the reference price`
          : `${change!.percentage}% ${isCheaper ? "below" : "above"} the reference price`
      }
    >
      {format === "amount" ? (
        <>
          {isCheaper ? "Save" : "Risen"} ${amount.toFixed(2)}
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
