import { buildPriceTimingSignal, type PriceHistoryPoint, type PriceTimingAction, type PriceTimingSignal } from "@dodgey-deals/shared";
import { memo } from "react";
import StoreLogoBadge from "@/components/StoreLogoBadge";

export interface PriceTimingSeries {
  store: string;
  points: PriceHistoryPoint[];
  currentPrice: number;
  currentIsSpecial: boolean;
}

const ACTION_STYLE: Record<PriceTimingAction, { label: string; className: string }> = {
  "buy-now": { label: "Good price", className: "bg-fair-50 text-fair-700" },
  wait: { label: "Price is high", className: "bg-alert-50 text-alert-700" },
  watch: { label: "Typical price", className: "bg-blue-50 text-blue-700" },
  "add-to-list": { label: "Need more history", className: "bg-stone-100 text-stone-700" },
};

function formatPrice(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "the current price" : `$${value.toFixed(2)}`;
}

function movementCopy(signal: PriceTimingSignal): string {
  if (signal.priceChange == null || signal.direction === "steady") {
    return "No recent price change.";
  }

  return `${signal.direction === "up" ? "Up" : "Down"} ${formatPrice(Math.abs(signal.priceChange))} since the last check.`;
}

function recommendationCopy(signal: PriceTimingSignal, currentIsSpecial: boolean): string {
  switch (signal.action) {
    case "buy-now":
      return `Near the lowest price seen in 90 days${currentIsSpecial ? ". On special now." : "."}`;
    case "wait":
      return "Above the 90-day average. It may be worth waiting.";
    case "watch":
      return "Around its usual price. No clear reason to buy or wait.";
    case "add-to-list":
      return "Not enough history to tell if it may drop. Keep it on your Watchlist and check again later.";
  }
}

function TimingRow({ series, showStore }: { series: PriceTimingSeries; showStore: boolean }) {
  const signal = buildPriceTimingSignal(series.points, series.currentPrice, series.currentIsSpecial);
  const action = ACTION_STYLE[signal.action];
  const bodyCopyClassName = "text-sm leading-5 font-normal text-stone-700";

  return (
    <div className="rounded-xl border border-stone-200/80 bg-white p-4">
      <div className="flex min-w-0 items-center gap-2">
        {showStore && <StoreLogoBadge store={series.store} variant="card" />}
        <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1 text-sm font-bold ${action.className}`}>
          {action.label}
        </span>
      </div>
      <p className={`mt-3 ${bodyCopyClassName}`}>{movementCopy(signal)}</p>
      <p className={`mt-2 ${bodyCopyClassName}`}>{recommendationCopy(signal, series.currentIsSpecial)}</p>
      <p className={`mt-3 ${bodyCopyClassName}`}>
        Based on {signal.observationCount} price check{signal.observationCount === 1 ? "" : "s"}. Prices can change.
      </p>
    </div>
  );
}

function PriceTimingRecommendation({ series }: { series: PriceTimingSeries[] }) {
  if (series.length === 0) return null;

  const showStore = series.length > 1;
  return (
    <div className={showStore ? "space-y-2" : ""}>
      {series.map((item) => (
        <TimingRow key={item.store} series={item} showStore={showStore} />
      ))}
    </div>
  );
}

export default memo(PriceTimingRecommendation);
