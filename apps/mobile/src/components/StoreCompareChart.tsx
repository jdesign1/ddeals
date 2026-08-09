"use client";

import { useState } from "react";
import type { BarChartRow } from "@dodgey-deals/shared";

/**
 * "Current Special vs Recent prices by store" bar chart — ported from
 * Prototype/index.html's DealModal (its `recharts` `BarChart`/diverging
 * stacked-bar visual: a black "average price" body, with a green segment
 * showing however much the current price sits under or over that average,
 * plus a green ring on whichever bar is the best price). Same visual/data
 * intent, hand-rolled in SVG rather than pulling in `recharts` as a new
 * dependency — apps/mobile doesn't have it installed, and one small
 * diverging bar chart doesn't need a full charting library. `motion`/
 * `lucide-react` are already real dependencies here; `recharts` would be a
 * brand-new one for a single chart.
 *
 * Data (`BarChartRow[]`) is `packages/shared/src/deal-detail.ts`'s
 * `buildBarChartData()` — real `currentDeals` prices only, no fabricated
 * numbers, same as the prototype's own `barChartData` memo.
 */
export default function StoreCompareChart({ rows }: { rows: BarChartRow[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <div className="flex h-44 w-full items-center justify-center rounded-xl border border-stone-100 bg-stone-50 p-2">
        <p className="text-xs font-semibold text-stone-400">No store data to compare yet.</p>
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((r) => Math.max(r.currentPrice, r.averagePrice))) || 1;
  const chartHeight = 130;
  const barWidth = 28;

  return (
    <div className="relative h-44 w-full rounded-xl border border-stone-100 bg-stone-50 p-2">
      <div className="flex h-full items-end justify-around">
        {rows.map((row, idx) => {
          const orangeUnder = row.currentPrice < row.averagePrice ? row.currentPrice : 0;
          const blueBody = row.currentPrice < row.averagePrice ? row.averagePrice - row.currentPrice : row.averagePrice;
          const orangeOver = row.currentPrice >= row.averagePrice ? row.currentPrice - row.averagePrice : 0;

          const toPx = (v: number) => (v / maxValue) * chartHeight;
          const underPx = toPx(orangeUnder);
          const bodyPx = toPx(blueBody);
          const overPx = toPx(orangeOver);

          return (
            <div
              key={row.storeName}
              className="relative flex flex-col items-center gap-1.5"
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered((h) => (h === idx ? null : h))}
            >
              {hovered === idx && (
                <div className="absolute bottom-full left-1/2 z-10 mb-2 w-40 -translate-x-1/2 space-y-1 rounded-xl border border-stone-800 bg-stone-900 p-3 text-xs text-white shadow-lg">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">{row.storeName}</p>
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
                    {row.currentPrice < row.averagePrice ? (
                      <span className="font-black text-fair-400">
                        ${(row.averagePrice - row.currentPrice).toFixed(2)} Below Avg
                      </span>
                    ) : row.currentPrice > row.averagePrice ? (
                      <span className="font-black text-alert-400">
                        ${(row.currentPrice - row.averagePrice).toFixed(2)} Above Avg
                      </span>
                    ) : (
                      <span className="font-black text-stone-300">Equal to Avg</span>
                    )}
                  </div>
                </div>
              )}

              <div className="relative flex flex-col-reverse" style={{ width: barWidth, height: chartHeight }}>
                {orangeUnder > 0 && (
                  <div className="relative w-full bg-[#16a34a]" style={{ height: underPx }}>
                    {row.isBestPrice && (
                      <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-[#16a34a]" />
                    )}
                  </div>
                )}
                <div className="w-full bg-[#171710]" style={{ height: bodyPx }} />
                {orangeOver > 0 && (
                  <div className="relative w-full bg-[#16a34a]" style={{ height: overPx }}>
                    <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-[#16a34a]" />
                  </div>
                )}
              </div>

              <span
                className="rounded-md px-2.5 py-1 text-[9px] font-black text-white"
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

const STORE_TICK_COLORS: Record<string, string> = { WW: "#059669", PNS: "#f59e0b", NW: "#e11d48", FS: "#16a34a" };
