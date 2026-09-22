import { ArrowDown, ArrowUp } from "lucide-react";
import { getPriceChange } from "@/lib/price-change";

export default function PriceChangeBadge({
  currentPrice,
  comparisonPrice,
}: {
  currentPrice: number;
  comparisonPrice: number | null | undefined;
}) {
  if (comparisonPrice == null) return null;
  const change = getPriceChange(currentPrice, comparisonPrice);
  if (!change) return null;

  const isCheaper = change.direction === "down";
  const ChangeIcon = isCheaper ? ArrowDown : ArrowUp;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md p-1 dd-type-badge text-white shadow-xs ${
        isCheaper ? "bg-fair-600" : "bg-alert-600"
      }`}
      aria-label={`${change.percentage}% ${isCheaper ? "below" : "above"} the reference price`}
    >
      <ChangeIcon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      {change.percentage}%
    </span>
  );
}
