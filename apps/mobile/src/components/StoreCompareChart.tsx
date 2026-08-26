"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { BarChartRow } from "@dodgey-deals/shared";

/**
 * "Current Special vs Recent prices by store" bar chart — ported from
 * Prototype/index.html's DealModal (its `recharts` `BarChart`/diverging
 * stacked-bar visual: a black "average price" body, with a colored segment
 * showing however much the current price sits under or over that average).
 * Hand-rolled in SVG-free divs rather than pulling in `recharts` as a new
 * dependency — apps/mobile doesn't have it installed, and one small
 * diverging bar chart doesn't need a full charting library.
 *
 * 2026-08-17 simplification pass (per Jay's ask, "how could this be
 * simpler"), scoped deliberately to the presentation layer only — no
 * change to `BarChartRow`/`buildBarChartData()` (packages/shared/src/
 * deal-detail.ts), so the underlying bar-height math (bar total = whichever
 * of current/average is larger, same as before) is untouched:
 *  1. Distinct colors for "cheaper than usual" vs "pricier than usual".
 *     Previously BOTH the under-average and over-average delta segments
 *     rendered the exact same hardcoded green (`#16a34a`) — confirmed by
 *     reading this file before the change, not assumed — so the only way
 *     to tell them apart was which side of the black body the color sat
 *     on. That's also why the page above this chart needed three lines of
 *     prose ("Green above dark means...", "Green within dark means...")
 *     just to explain the chart. Now: fair-600 (green, existing "Real
 *     Saver" token) = cheaper, alert-600 (red, existing "Dodgy Deal"
 *     token) = pricier — reuses the app's own already-established
 *     traffic-light meaning instead of introducing new colors, so the
 *     explanatory prose becomes unnecessary rather than just shorter (see
 *     the page-level legend/copy trim in the same commit).
 *  2. Numbers are no longer hover-only. This is `apps/mobile` — a
 *     mobile-viewport-only app — and the old tooltip only opened on
 *     `onMouseEnter`, which doesn't fire on touch; a phone user had no way
 *     to see the actual $ figures at all. Each bar now always shows its
 *     current price and a colored delta badge (arrow + %) above the bar.
 *     The hover tooltip is kept as a bonus for desktop/mouse use (`avg`,
 *     `saved/paid extra`, exact $ delta) but is no longer required reading.
 *  3. `bg-[#171710]` (the average-price body) swapped for `bg-ink-600` —
 *     confirmed via globals.css that `--color-ink-600: #171710` is a
 *     pixel-for-pixel match, so this is a token-consistency cleanup, not a
 *     visual change: same color, now traceable to the design system
 *     instead of a magic hex duplicated in this file.
 *  4. Each bar gets an `aria-label` summarizing the store/price/delta in
 *     plain language, and the delta badge pairs an arrow icon with the
 *     color (not color alone) for colorblind users.
 *
 * Deliberately NOT done in this pass (bigger scope, flagged rather than
 * attempted half-done):
 *  - Not switched to a "was → now" two-point/dumbbell chart or a real
 *    price-over-time sparkline. Both were floated as options; both are a
 *    materially different visual (or, for the sparkline, need a new
 *    `price_history` fetch this app doesn't do client-side at all right
 *    now — see this page's own header comment). Doing either well is a
 *    separate, reviewable change, not a drive-by inside a "simplify the
 *    colors and labels" pass.
 *  - Not re-sorting `rows` by price and not resurrecting `isBestPrice`
 *    (the green best-price ring) — that indicator was deliberately removed
 *    2026-08-1x per Jay's own ask; not this session's call to reverse.
 */
export default function StoreCompareChart({ rows }: { rows: BarChartRow[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <div className="flex h-56 w-full items-center justify-center rounded-xl border border-stone-100 bg-stone-50 p-2">
        <p className="text-[13px] leading-4 font-semibold text-stone-500">No store data to compare yet.</p>
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((r) => Math.max(r.currentPrice, r.averagePrice))) || 1;
  const chartHeight = 130;
  const barWidth = 28;

  return (
    <div className="relative flex h-56 w-full flex-col rounded-xl border border-stone-100 bg-stone-50 p-2">
      <div className="flex min-h-0 flex-1 items-end justify-around">
        {rows.map((row, idx) => {
          const isCheaper = row.currentPrice < row.averagePrice;
          const isPricier = row.currentPrice > row.averagePrice;
          // Body (black) is always the SMALLER of current/average -- the
          // shared, common portion both prices reach -- with the colored
          // segment carrying just the DELTA on top of it (2026-08-21, per
          // Jay: "the bar graph should show the larger area as black, and
          // the smaller area as the green or red, to match the percentage
          // less or more"). Was backwards for the cheaper case specifically:
          // `under` used to be the FULL `currentPrice` (colored) with `body`
          // as just the delta (black) -- i.e. color was the majority of the
          // bar and black was the sliver, the opposite of what this asks
          // for. The pricier case already had this right (`body` was already
          // the full `averagePrice`, `over` already just the delta) -- only
          // `under`/`body` for the cheaper branch needed swapping, `over`
          // is unchanged. Total bar height (`under + body` or `body + over`)
          // is untouched either way -- still `Math.max(currentPrice,
          // averagePrice)` -- this only changes which of the two stacked
          // segments carries which portion of that total.
          const under = isCheaper ? row.averagePrice - row.currentPrice : 0;
          const body = isCheaper ? row.currentPrice : row.averagePrice;
          const over = isPricier ? row.currentPrice - row.averagePrice : 0;

          const toPx = (v: number) => (v / maxValue) * chartHeight;
          const underPx = toPx(under);
          const bodyPx = toPx(body);
          const overPx = toPx(over);

          const pct =
            row.averagePrice > 0 ? Math.round(((row.currentPrice - row.averagePrice) / row.averagePrice) * 100) : 0;
          const deltaClass = isCheaper ? "bg-fair-600" : "bg-alert-600";

          // No claim about being "above/below average" when there's no real
          // average to compare against (row.averagePrice <= 0) -- avoids a
          // misleading "0% above the recent $0.00 average" readout, since
          // `pct` is deliberately forced to 0 in that case (see above) but
          // `isPricier`/`isCheaper` would otherwise still fire off a $0 avg.
          const ariaLabel =
            row.averagePrice <= 0
              ? `${row.storeName}: $${row.currentPrice.toFixed(2)}, no recent average to compare`
              : isCheaper
                ? `${row.storeName}: $${row.currentPrice.toFixed(2)}, ${Math.abs(pct)}% below the recent $${row.averagePrice.toFixed(2)} average`
                : isPricier
                  ? `${row.storeName}: $${row.currentPrice.toFixed(2)}, ${Math.abs(pct)}% above the recent $${row.averagePrice.toFixed(2)} average`
                  : `${row.storeName}: $${row.currentPrice.toFixed(2)}, same as the recent average`;

          return (
            <div
              key={row.storeName}
              className="relative flex flex-col items-center gap-1.5"
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered((h) => (h === idx ? null : h))}
              role="group"
              aria-label={ariaLabel}
            >
              {hovered === idx && (
                <div className="absolute bottom-full left-1/2 z-10 mb-2 w-40 -translate-x-1/2 space-y-1 rounded-xl border border-stone-800 bg-stone-900 p-3 text-[13px] leading-4 text-white shadow-lg">
                  <p className="text-[11px] font-extrabold tracking-wider text-stone-400">{row.storeName}</p>
                  <div className="flex justify-between gap-4">
                    <span className="text-stone-300">Current Price:</span>
                    <span className="font-extrabold text-white">${row.currentPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-stone-300">Recent Avg:</span>
                    <span className="font-extrabold text-stone-300">${row.averagePrice.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-4 border-t border-stone-800 pt-1">
                    <span className="font-semibold text-stone-400">Status:</span>
                    {isCheaper ? (
                      <span className="font-black text-fair-400">
                        ${(row.averagePrice - row.currentPrice).toFixed(2)} Below Avg
                      </span>
                    ) : isPricier ? (
                      <span className="font-black text-alert-400">
                        ${(row.currentPrice - row.averagePrice).toFixed(2)} Above Avg
                      </span>
                    ) : (
                      <span className="font-black text-stone-300">Equal to Avg</span>
                    )}
                  </div>
                </div>
              )}

              {/* Always-visible price + delta — not gated behind hover, so
                  this reads on a phone with no mouse (see file header). */}
              <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                <span className="text-sm font-black text-stone-900">${row.currentPrice.toFixed(2)}</span>
                {pct !== 0 && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[13px] leading-4 font-black text-white ${deltaClass}`}
                  >
                    {isCheaper ? (
                      <ArrowDown className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <ArrowUp className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    )}
                    {Math.abs(pct)}%
                  </span>
                )}
              </div>

              <div className="relative flex flex-col-reverse" style={{ width: barWidth, height: chartHeight }}>
                <div className="w-full bg-ink-600" style={{ height: bodyPx }} />
                {under > 0 && <div className={`w-full ${deltaClass}`} style={{ height: underPx }} />}
                {over > 0 && <div className={`w-full ${deltaClass}`} style={{ height: overPx }} />}
              </div>

              <span
                className="rounded-md px-2.5 py-1 text-[10px] font-black text-white"
                style={{ backgroundColor: STORE_TICK_COLORS[row.name] || "#78716c" }}
              >
                {row.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PNS darkened from #f59e0b (amber-500) -> #d97706 (amber-600), matching
// store-meta.ts's own bg-amber-600 (2026-08-11, per Jay's ask).
const STORE_TICK_COLORS: Record<string, string> = { WW: "#059669", PNS: "#d97706", NW: "#e11d48", FS: "#16a34a" };
