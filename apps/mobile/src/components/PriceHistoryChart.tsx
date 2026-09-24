import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { AssessmentVerdict, PriceHistoryPoint } from "@dodgey-deals/shared";
import PriceChangeBadge from "@/components/PriceChangeBadge";

interface PriceHistoryChartProps {
  points: PriceHistoryPoint[];
  currentPrice: number;
  currentStore: string;
  currentIsSpecial: boolean;
  comparisonPrice?: number | null;
  loading?: boolean;
  error?: string | null;
  storeOptions?: { value: string; label: string }[];
  selectedStore?: string;
  onStoreChange?: (store: string) => void;
  verdict: AssessmentVerdict;
  historySeries?: PriceHistorySeries[];
  legacySingleStorePresentation?: boolean;
}

interface ChartPoint extends PriceHistoryPoint {
  isCurrent?: boolean;
}

export const ALL_STORES_VALUE = "__all__";

export interface PriceHistorySeries {
  store: string;
  points: PriceHistoryPoint[];
  currentPrice: number;
  currentIsSpecial: boolean;
  verdict: AssessmentVerdict;
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
    .filter((point) => point.price > 0 && Number.isFinite(point.price) && Number.isFinite(new Date(point.scrapedAt).getTime()))
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

function chartColorForStore(store: string): string {
  const normalized = store.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("woolworth")) return "#059669";
  if (normalized.includes("paknsave")) return "#d97706";
  if (normalized.includes("newworld")) return "#e11d48";
  if (normalized.includes("foursquare")) return "#16a34a";
  return "#78716c";
}

const VERDICT_FADE_COLORS: Record<AssessmentVerdict, string> = {
  "Real Saver": "var(--color-verdict-real-saver)",
  "Dodgy Deal": "var(--color-verdict-dodgy)",
  "Fair Deal": "var(--color-dodgy-600)",
  "Early read": "var(--color-verdict-unknown)",
  "Limited history": "var(--color-verdict-unknown)",
};

function hasDrawableArea(coordinates: { x: number; y: number }[]): boolean {
  return coordinates.length >= 2 && coordinates[0].x < coordinates[coordinates.length - 1].x;
}

export default function PriceHistoryChart({
  points,
  currentPrice,
  currentStore,
  currentIsSpecial,
  comparisonPrice = null,
  loading = false,
  error = null,
  storeOptions = [],
  selectedStore = "",
  onStoreChange,
  verdict,
  historySeries = [],
  legacySingleStorePresentation = false,
}: PriceHistoryChartProps) {
  const [chartNow] = useState(() => Date.now());
  const [showHistoryList, setShowHistoryList] = useState(false);
  const [chartElement, setChartElement] = useState<HTMLDivElement | null>(null);
  const [isChartInView, setIsChartInView] = useState(false);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldShowChartAnimation = shouldReduceMotion || isChartInView || typeof IntersectionObserver === "undefined";
  useEffect(() => {
    if (!chartElement || isChartInView || shouldReduceMotion) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
          setIsChartInView(true);
          observer.disconnect();
        }
      },
      {
        root: document.querySelector<HTMLElement>(".mobile-scroll-surface"),
        threshold: 0.25,
      }
    );
    observer.observe(chartElement);
    return () => observer.disconnect();
  }, [chartElement, isChartInView, shouldReduceMotion]);
  const showStoreSelector = storeOptions.length > 1 && Boolean(onStoreChange);
  const storeSelector = showStoreSelector ? (
    <div className="flex justify-end">
      <div className="relative inline-flex items-center">
        <select
          id="price-history-store"
          value={selectedStore}
          onChange={(event) => onStoreChange?.(event.target.value)}
          aria-label="Select supermarket for price history"
          className={`min-h-10 max-w-full appearance-none border-0 bg-transparent py-2 pl-2 pr-6 text-right text-[15px] leading-5 font-semibold text-stone-800 shadow-none outline-none focus:border-0 ${
            selectedStore === ALL_STORES_VALUE ? "w-16" : "w-fit"
          }`}
        >
          {storeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1 h-4 w-4 text-stone-600" aria-hidden="true" />
      </div>
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="space-y-3">
        {storeSelector}
        <div className="flex h-64 w-full items-center justify-center rounded-xl border border-stone-100 bg-stone-50 p-4">
          <p className="text-sm font-semibold text-stone-500">Loading 90-day price history…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        {storeSelector}
        <div className="flex h-64 w-full items-center justify-center rounded-xl border border-stone-100 bg-stone-50 p-4 text-center">
          <p className="text-sm leading-5 font-semibold text-stone-500">90-day price history isn’t available right now.</p>
        </div>
      </div>
    );
  }

  const showingAllStores = selectedStore === ALL_STORES_VALUE;
  const sourceSeries: PriceHistorySeries[] = showingAllStores
    ? historySeries
    : [{ store: currentStore, points, currentPrice, currentIsSpecial, verdict }];
  const renderedSeries = sourceSeries
    .map((series) => ({
      ...series,
      color: chartColorForStore(series.store),
      verdictColor: VERDICT_FADE_COLORS[series.verdict],
      points: buildChartPoints(series.points, series.currentPrice, series.currentIsSpecial, chartNow),
    }))
    .filter((series) => series.points.length > 0);
  if (renderedSeries.length === 0 || renderedSeries.every((series) => series.points.length < 2)) {
    return (
      <div className="space-y-3">
        {storeSelector}
        <div className="flex h-64 w-full items-center justify-center rounded-xl border border-stone-100 bg-stone-50 p-4 text-center">
          <p className="text-sm leading-5 font-semibold text-stone-500">Not enough recorded price history to draw this chart yet.</p>
        </div>
      </div>
    );
  }

  const now = chartNow;
  const start = now - WINDOW_MS;
  const prices = renderedSeries.flatMap((series) => series.points.map((point) => point.price));
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
  const coordinatesBySeries = renderedSeries.map((series) => ({
    ...series,
    coordinates: series.points.map((point) => ({ point, x: xFor(point), y: yFor(point.price) })),
  }));
  const listPoints = coordinatesBySeries
    .flatMap((series) =>
      series.points
        .filter((point) => new Date(point.scrapedAt).getTime() >= start)
        .map((point) => ({ point, store: series.store, seriesPoints: series.points }))
    )
    .sort((a, b) => new Date(b.point.scrapedAt).getTime() - new Date(a.point.scrapedAt).getTime());
  const gridValues = [yMax, yMin + yRange / 2, yMin];
  const hasComparisonPrice = typeof comparisonPrice === "number" && Number.isFinite(comparisonPrice) && comparisonPrice > 0;
  return (
    <div className="space-y-3">
      {storeSelector}
      <div ref={setChartElement} className="relative h-[21rem] [perspective:1000px]">
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
        <div className="flex min-h-5 items-start justify-center gap-2 pb-0">
          <span className="dd-type-control text-stone-700">
            {showingAllStores ? "All supermarkets" : <>{currentStore} {legacySingleStorePresentation ? "current price" : "price"} <span className="font-display font-extrabold text-stone-900">${currentPrice.toFixed(2)}</span></>}
          </span>
          {!showingAllStores && hasComparisonPrice && (
            <PriceChangeBadge currentPrice={currentPrice} comparisonPrice={comparisonPrice} />
          )}
        </div>
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="block h-64 w-full"
          role="img"
          aria-label="Price history over the last 90 days, with on-special periods highlighted and a verdict-coloured fade below each line"
        >
          {gridValues.map((value) => {
            const y = yFor(value);
            return (
              <g key={value}>
                <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y} stroke="var(--dd-chart-grid)" strokeDasharray="3 4" />
                <text x={PLOT_LEFT - 6} y={y + 4} textAnchor="end" fontSize="14" fontWeight="600" fill="var(--dd-chart-axis)">
                  ${value.toFixed(2)}
                </text>
              </g>
            );
          })}

          <defs>
            {coordinatesBySeries.map((series, index) =>
              !hasDrawableArea(series.coordinates) ? null : (
                <linearGradient
                  key={`verdict-fade-${index}`}
                  id={`verdict-fade-${index}`}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1={PLOT_TOP}
                  x2="0"
                  y2={PLOT_BOTTOM}
                >
                  <stop offset="0%" stopColor={series.verdictColor} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={series.verdictColor} stopOpacity="0" />
                </linearGradient>
              )
            )}
          </defs>

          {coordinatesBySeries.map((series, index) => {
            if (!hasDrawableArea(series.coordinates)) return null;
            const first = series.coordinates[0];
            const last = series.coordinates[series.coordinates.length - 1];
            const linePath = series.coordinates
              .map(({ x, y }, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${x} ${y}`)
              .join(" ");
            const areaPath = `${linePath} L ${last.x} ${PLOT_BOTTOM} L ${first.x} ${PLOT_BOTTOM} Z`;

            return <path key={`verdict-area-${index}`} d={areaPath} fill={`url(#verdict-fade-${index})`} />;
          })}

          {coordinatesBySeries.map((series) =>
            series.coordinates.slice(0, -1).map((coordinate, index) => {
              const next = series.coordinates[index + 1];
              return (
                <motion.line
                  key={`${series.store}-${coordinate.point.scrapedAt}-${next.point.scrapedAt}`}
                  x1={coordinate.x}
                  x2={next.x}
                  y1={coordinate.y}
                  y2={next.y}
                  stroke={showingAllStores ? series.color : coordinate.point.isSpecial ? "var(--dd-chart-special)" : "var(--dd-chart-regular)"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0 }}
                  animate={shouldShowChartAnimation ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.42,
                    delay: shouldReduceMotion ? 0 : index * 0.1,
                    ease: "easeOut",
                  }}
                />
              );
            })
          )}

          {coordinatesBySeries.map((series) =>
            series.coordinates.map(({ point, x, y }, index) => (
              <g key={`${series.store}-${point.scrapedAt}-${point.price}`}>
                <motion.circle
                  cx={x}
                  cy={y}
                  fill={showingAllStores ? series.color : point.isSpecial ? "var(--dd-chart-special)" : "var(--dd-chart-regular)"}
                  stroke="var(--dd-chart-point-stroke)"
                  strokeWidth="2"
                  initial={shouldReduceMotion ? false : { r: 0, opacity: 0 }}
                  animate={shouldShowChartAnimation ? { r: 5, opacity: 1 } : { r: 0, opacity: 0 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.24,
                    delay: shouldReduceMotion ? 0 : index * 0.1 + 0.18,
                    ease: "easeOut",
                  }}
                />
                <title>
                  {`${series.store} · ${formatDate(point.scrapedAt, point.isCurrent)}: $${point.price.toFixed(2)} · ${point.isSpecial ? "On special" : "Regular price"}`}
                </title>
              </g>
            ))
          )}

          <text x={PLOT_LEFT} y={PLOT_BOTTOM + 28} textAnchor="start" fontSize="14" fontWeight="700" fill="var(--dd-chart-axis)">
            90 days ago
          </text>
          <text x={PLOT_RIGHT} y={PLOT_BOTTOM + 28} textAnchor="end" fontSize="14" fontWeight="700" fill="var(--dd-chart-axis)">
            Today
          </text>
        </svg>
        <div className="-mt-3 flex flex-wrap items-center justify-center gap-2 text-sm leading-4 font-bold text-stone-700">
          {showingAllStores
            ? renderedSeries.map((series) => (
                <div key={series.store} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
                  <span>{series.store}</span>
                </div>
              ))
            : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-fair-600" />
                    <span>On special</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-stone-400" />
                    <span>Regular price</span>
                  </div>
                </>
              )}
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
                <span className="dd-type-meta text-stone-500">Swipe down for history</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {listPoints.length > 0 ? (
                  listPoints.map(({ point, store, seriesPoints }) => {
                    const pointIndex = seriesPoints.findIndex(
                      (candidate) => candidate.scrapedAt === point.scrapedAt && candidate.price === point.price
                    );
                    const previousPoint = pointIndex > 0 ? seriesPoints[pointIndex - 1] : undefined;
                    const priceChange = previousPoint ? point.price - previousPoint.price : 0;
                    const PriceChangeIcon = priceChange > 0 ? ArrowUp : priceChange < 0 ? ArrowDown : null;

                    return (
                      <div
                        key={`${point.scrapedAt}-${point.price}`}
                        className="flex items-center justify-between gap-3 border-b border-stone-100 py-2 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-700">
                            {showingAllStores ? `${store} · ` : ""}{formatListDate(point.scrapedAt, point.isCurrent)}
                          </p>
                          <p className={`text-xs font-semibold ${point.isSpecial ? "text-fair-700" : "text-stone-500"}`}>
                            {point.isSpecial ? "On special" : "Regular price"}
                            {point.isCurrent ? " · Current" : ""}
                          </p>
                        </div>
                        <span className="flex flex-shrink-0 items-center gap-1 font-display text-base font-extrabold text-stone-900">
                          <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
                            {PriceChangeIcon && (
                              <PriceChangeIcon
                                className={`h-4 w-4 ${priceChange > 0 ? "text-alert-600" : "text-fair-600"}`}
                                strokeWidth={3}
                              />
                            )}
                          </span>
                          ${point.price.toFixed(2)}
                        </span>
                      </div>
                    );
                  })
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
