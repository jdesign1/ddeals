import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { PriceHistoryPoint } from "@dodgey-deals/shared";

interface PriceHistoryChartProps {
  points: PriceHistoryPoint[];
  currentPrice: number;
  currentStore: string;
  currentIsSpecial: boolean;
  comparisonPrice?: number | null;
  loading?: boolean;
  error?: string | null;
}

interface ChartPoint extends PriceHistoryPoint {
  isCurrent?: boolean;
}

const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const VIEWBOX_WIDTH = 360;
const VIEWBOX_HEIGHT = 210;
const PLOT_LEFT = 52;
const PLOT_RIGHT = 344;
const PLOT_TOP = 16;
const PLOT_BOTTOM = 164;

function formatDate(value: string, isCurrent = false): string {
  if (isCurrent) return "Today";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function formatListDate(value: string, isCurrent = false): string {
  if (isCurrent) return "Today";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function buildChartPoints(
  points: PriceHistoryPoint[],
  currentPrice: number,
  currentIsSpecial: boolean,
  now: number
): ChartPoint[] {
  const start = now - WINDOW_MS;
  const observed: ChartPoint[] = points
    .filter((point) => Number.isFinite(point.price) && Number.isFinite(new Date(point.scrapedAt).getTime()))
    .map((point) => ({ ...point }))
    .sort((a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime());

  if (observed.length === 0) return [];

  const last = observed[observed.length - 1];
  const currentPoint: ChartPoint = {
    price: currentPrice,
    isSpecial: currentIsSpecial,
    scrapedAt: new Date(now).toISOString(),
    isCurrent: true,
  };
  const lastTime = new Date(last.scrapedAt).getTime();
  if (Math.abs(now - lastTime) > 60 * 1000 || last.price !== currentPrice || last.isSpecial !== currentIsSpecial) {
    observed.push(currentPoint);
  } else {
    observed[observed.length - 1] = { ...last, isCurrent: true };
  }

  return observed.filter((point) => new Date(point.scrapedAt).getTime() <= now && new Date(point.scrapedAt).getTime() >= start - WINDOW_MS);
}

export default function PriceHistoryChart({
  points,
  currentPrice,
  currentStore,
  currentIsSpecial,
  comparisonPrice = null,
  loading = false,
  error = null,
}: PriceHistoryChartProps) {
  const [chartNow] = useState(() => Date.now());
  const [showHistoryList, setShowHistoryList] = useState(false);
  const shouldReduceMotion = useReducedMotion() ?? false;

  if (loading) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-stone-100 bg-stone-50 p-4">
        <p className="text-sm font-semibold text-stone-500">Loading 90-day price history…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-stone-100 bg-stone-50 p-4 text-center">
        <p className="text-sm leading-5 font-semibold text-stone-500">90-day price history isn’t available right now.</p>
      </div>
    );
  }

  const chartPoints = buildChartPoints(points, currentPrice, currentIsSpecial, chartNow);
  if (chartPoints.length < 2) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-stone-100 bg-stone-50 p-4 text-center">
        <p className="text-sm leading-5 font-semibold text-stone-500">Not enough recorded price history to draw this chart yet.</p>
      </div>
    );
  }

  const now = chartNow;
  const start = now - WINDOW_MS;
  const prices = chartPoints.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spread = maxPrice - minPrice;
  const padding = spread > 0 ? spread * 0.14 : Math.max(maxPrice * 0.12, 0.5);
  const yMin = Math.max(0, minPrice - padding);
  const yMax = maxPrice + padding;
  const yRange = yMax - yMin || 1;
  const xFor = (point: ChartPoint) => {
    const time = Math.min(now, Math.max(start, new Date(point.scrapedAt).getTime()));
    return PLOT_LEFT + ((time - start) / WINDOW_MS) * (PLOT_RIGHT - PLOT_LEFT);
  };
  const yFor = (price: number) => PLOT_BOTTOM - ((price - yMin) / yRange) * (PLOT_BOTTOM - PLOT_TOP);
  const coordinates = chartPoints.map((point) => ({ point, x: xFor(point), y: yFor(point.price) }));
  const listPoints = chartPoints
    .filter((point) => new Date(point.scrapedAt).getTime() >= start)
    .sort((a, b) => new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime());
  const gridValues = [yMax, yMin + yRange / 2, yMin];
  const hasComparisonPrice = typeof comparisonPrice === "number" && Number.isFinite(comparisonPrice) && comparisonPrice > 0;
  const comparisonPct = hasComparisonPrice ? Math.round(((currentPrice - comparisonPrice) / comparisonPrice) * 100) : 0;
  const isCheaperThanComparison = hasComparisonPrice && currentPrice < comparisonPrice;

  return (
    <div className="space-y-3">
      <div className="relative h-[21rem] [perspective:1000px]">
        <motion.div
          className="relative h-full w-full"
          animate={{ rotateY: showHistoryList ? 180 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <button
            type="button"
            onClick={() => setShowHistoryList(true)}
            aria-label="Show price history as a list"
            aria-hidden={showHistoryList}
            tabIndex={showHistoryList ? -1 : 0}
            className="h-full w-full rounded-xl border border-stone-100 bg-stone-50 p-2 text-left"
            style={{ backfaceVisibility: "hidden", pointerEvents: showHistoryList ? "none" : "auto" }}
          >
        <div className="flex min-h-6 items-center justify-center gap-2 pb-1">
          <span className="dd-type-control text-stone-700">
            {currentStore} current price <span className="font-display font-extrabold text-stone-900">${currentPrice.toFixed(2)}</span>
          </span>
          {hasComparisonPrice && comparisonPct !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 dd-type-badge text-white ${
                isCheaperThanComparison ? "bg-fair-600" : "bg-alert-600"
              }`}
              aria-label={`${Math.abs(comparisonPct)}% ${isCheaperThanComparison ? "below" : "above"} the recent average`}
            >
              {isCheaperThanComparison ? (
                <ArrowDown className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              ) : (
                <ArrowUp className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              )}
              {Math.abs(comparisonPct)}%
            </span>
          )}
        </div>
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="h-64 w-full"
          role="img"
          aria-label="Price history over the last 90 days, with on-special periods highlighted"
        >
          {gridValues.map((value) => {
            const y = yFor(value);
            return (
              <g key={value}>
                <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y} stroke="var(--dd-chart-grid)" strokeDasharray="3 4" />
                <text x={PLOT_LEFT - 6} y={y + 4} textAnchor="end" fontSize="12" fill="var(--dd-chart-axis)">
                  ${value.toFixed(2)}
                </text>
              </g>
            );
          })}

          {coordinates.slice(0, -1).map((coordinate, index) => {
            const next = coordinates[index + 1];
            return (
              <motion.line
                key={`${coordinate.point.scrapedAt}-${next.point.scrapedAt}`}
                x1={coordinate.x}
                x2={next.x}
                y1={coordinate.y}
                y2={next.y}
                stroke={coordinate.point.isSpecial ? "var(--dd-chart-special)" : "var(--dd-chart-regular)"}
                strokeWidth="3"
                strokeLinecap="round"
                initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.42,
                  delay: shouldReduceMotion ? 0 : index * 0.1,
                  ease: "easeOut",
                }}
              />
            );
          })}

          {coordinates.map(({ point, x, y }, index) => (
            <g key={`${point.scrapedAt}-${point.price}`}>
              <motion.circle
                cx={x}
                cy={y}
                fill={point.isSpecial ? "var(--dd-chart-special)" : "var(--dd-chart-regular)"}
                stroke="var(--dd-chart-point-stroke)"
                strokeWidth="2"
                initial={shouldReduceMotion ? false : { r: 0, opacity: 0 }}
                animate={{ r: 5, opacity: 1 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.24,
                  delay: shouldReduceMotion ? 0 : index * 0.1 + 0.18,
                  ease: "easeOut",
                }}
              />
              <title>
                {`${formatDate(point.scrapedAt, point.isCurrent)}: $${point.price.toFixed(2)} · ${point.isSpecial ? "On special" : "Regular price"}`}
              </title>
            </g>
          ))}

          <text x={PLOT_LEFT} y={PLOT_BOTTOM + 28} textAnchor="start" fontSize="12" fontWeight="700" fill="var(--dd-chart-axis)">
            90 days ago
          </text>
          <text x={PLOT_RIGHT} y={PLOT_BOTTOM + 28} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--dd-chart-axis)">
            Today
          </text>
        </svg>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-sm leading-4 font-bold text-stone-700">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-fair-600" />
            <span>On special</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-stone-400" />
            <span>Regular price</span>
          </div>
        </div>
          </button>
          <button
            type="button"
            onClick={() => setShowHistoryList(false)}
            aria-label="Show price history graph"
            aria-hidden={!showHistoryList}
            tabIndex={showHistoryList ? 0 : -1}
            className="absolute inset-0 h-full w-full rounded-xl border border-stone-100 bg-stone-50 p-4 text-left"
            style={{ backfaceVisibility: "hidden", pointerEvents: showHistoryList ? "auto" : "none", transform: "rotateY(180deg)" }}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-2">
                <span className="dd-type-control text-stone-700">Price history</span>
                <span className="dd-type-meta text-stone-500">Tap to view graph</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {listPoints.length > 0 ? (
                  listPoints.map((point) => (
                    <div
                      key={`${point.scrapedAt}-${point.price}`}
                      className="flex items-center justify-between gap-3 border-b border-stone-100 py-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-700">
                          {formatListDate(point.scrapedAt, point.isCurrent)}
                        </p>
                        <p className={`text-xs font-semibold ${point.isSpecial ? "text-fair-700" : "text-stone-500"}`}>
                          {point.isSpecial ? "On special" : "Regular price"}
                          {point.isCurrent ? " · Current" : ""}
                        </p>
                      </div>
                      <span className="flex-shrink-0 font-display text-base font-extrabold text-stone-900">
                        ${point.price.toFixed(2)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-sm font-semibold text-stone-500">No price changes recorded in the last 90 days.</p>
                )}
              </div>
            </div>
          </button>
        </motion.div>
      </div>
      <p className="text-center text-sm leading-5 text-stone-600">
        {showHistoryList ? "Tap to return to the graph." : "The line connects recorded price changes; tap to see dates and prices."}
      </p>
    </div>
  );
}
