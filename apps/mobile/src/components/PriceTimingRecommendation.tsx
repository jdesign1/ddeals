import { Eye, ListPlus, ShoppingCart, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buildPriceTimingSignal, type PriceHistoryPoint, type PriceTimingAction, type PriceTimingSignal } from "@dodgey-deals/shared";

export interface PriceTimingSeries {
  store: string;
  points: PriceHistoryPoint[];
  currentPrice: number;
  currentIsSpecial: boolean;
}

const ACTION_STYLE: Record<PriceTimingAction, { label: string; icon: LucideIcon; className: string }> = {
  "buy-now": { label: "Buy now", icon: ShoppingCart, className: "bg-fair-50 text-fair-700" },
  wait: { label: "Wait", icon: Timer, className: "bg-alert-50 text-alert-700" },
  watch: { label: "Watch", icon: Eye, className: "bg-blue-50 text-blue-700" },
  "add-to-list": { label: "Add to list", icon: ListPlus, className: "bg-stone-100 text-stone-700" },
};

function formatPrice(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "the current price" : `$${value.toFixed(2)}`;
}

function movementCopy(signal: PriceTimingSignal): string {
  if (signal.priceChange == null || signal.direction === "steady") {
    return "There is no clear recent rise or drop to call out.";
  }

  return `Price has ${signal.direction === "up" ? "risen" : "dropped"} by ${formatPrice(Math.abs(signal.priceChange))} since the previous recorded price.`;
}

function recommendationCopy(signal: PriceTimingSignal, currentIsSpecial: boolean): string {
  switch (signal.action) {
    case "buy-now":
      return `The current price is close to the 90-day low of ${formatPrice(signal.low)}${currentIsSpecial ? " and is on special" : ""}.`;
    case "wait":
      return `The current price is above the 90-day average of ${formatPrice(signal.average)}, so it may be worth waiting for a better price.`;
    case "watch":
      return "The current price sits in its usual range, so the history does not give a strong reason to buy or wait.";
    case "add-to-list":
      return "There are not enough distinct recorded prices to tell whether it is likely to drop. Add it to a list and check back after more updates.";
  }
}

function TimingRow({ series, showStore }: { series: PriceTimingSeries; showStore: boolean }) {
  const signal = buildPriceTimingSignal(series.points, series.currentPrice, series.currentIsSpecial);
  const action = ACTION_STYLE[signal.action];
  const ActionIcon = action.icon;

  return (
    <div className="rounded-xl border border-stone-200/80 bg-white p-4">
      <div className="min-w-0">
        {showStore && <p className="dd-type-meta truncate text-stone-500">{series.store}</p>}
        <span className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold ${action.className}`}>
          <ActionIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          {action.label}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-stone-700">{movementCopy(signal)}</p>
      <p className="mt-2 text-sm leading-5 text-stone-600">{recommendationCopy(signal, series.currentIsSpecial)}</p>
      <p className="mt-3 text-sm leading-5 font-normal text-stone-500">
        Based on {signal.observationCount} distinct recorded price{signal.observationCount === 1 ? "" : "s"}. History is a guide, not a guarantee.
      </p>
    </div>
  );
}

export default function PriceTimingRecommendation({ series }: { series: PriceTimingSeries[] }) {
  if (series.length === 0) return null;

  const showStore = series.length > 1;
  return (
    <div className={showStore ? "space-y-2" : ""}>
      {series.map((item) => (
        <TimingRow key={item.store} series={item} showStore={showStore} />
      ))}
  );
}
