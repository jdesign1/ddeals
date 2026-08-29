"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CalendarDays, Search } from "lucide-react";
import { motion } from "motion/react";
import {
  collapseConsecutiveDealChecks,
  fetchDealCheckHistory,
  fetchNonSpecialProductCards,
  describeFetchError,
  type DealCheckRow,
  type ProductCard as ProductCardData,
  type CurrentDeal,
  productMatchesSearch,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/search-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import ErrorState from "@/components/ErrorState";
import HistoryProductCard from "@/components/HistoryProductCard";

/**
 * All Checks — ported from Prototype/index.html's `HistoryTab` (2026-08-11,
 * per Jay's ask to port both "All Checks" and "Deal Stats"). New route
 * (`/history`), reached via a link from `/me` (Deal Stats) rather than its
 * own bottom-nav tab — Jay's call, see project.md.
 *
 * Real data throughout, backed by `deal_checks` (see
 * `packages/shared/src/deal-checks.ts`) — every row here is a real past
 * visit to the deal-assessment page, not a fabricated or replayed one.
 *
 * Deliberate differences from the prototype's own `HistoryTab`, flagged
 * rather than silently dropped:
 *  - Cards use this app's compact `HistoryProductCard`, shaped like a Lists
 *    product item so the history can show many more checks on screen while
 *    retaining the checked row's own snapshotted store/price/verdict.
 *  - History search uses the same shared token, prefix, synonym, and bounded
 *    typo matcher as full-screen product search, so a checked branded item
 *    behaves consistently across the app.
 *  - No "Recheck" action wired to reopen a modal — tapping a card here
 *    navigates to the real `/deal/[id]/[store]` route instead (via
 *    `HistoryProductCard`'s own tap-to-navigate), this app's real
 *    equivalent of the prototype's `onRecheck`/`DealModal` reopen. This
 *    itself logs a NEW `deal_checks` row, same as visiting from anywhere
 *    else — a deliberate, accurate behavior (re-checking a deal really is
 *    checking it again), not an accidental duplicate-logging bug.
 *  - A checked product that's rolled off every current special (no longer
 *    in the live specials dataset `useSearch()` already loads) is resolved
 *    via `fetchNonSpecialProductCards` — a small, targeted, on-demand
 *    lookup (see that function's own doc comment in data.ts, previously
 *    written but never actually called from anywhere in this app) instead
 *    of silently dropping it from the list or fabricating stale data.
 *    Products that don't resolve either way are still counted in "N
 *    checks" and simply skipped from the rendered list — real, not faked.
 *
 * The 3 "All Checks" `<h1>`s below (loading state, signed-out state, real
 * content) are gone as of 2026-08-13, per Jay's "remove the h1 titles from
 * each page, as we have the title in the top nav bar" -- `AppHeader.tsx`
 * already shows "All Checks" for this route via `ROUTE_TITLES`, so the
 * in-page heading was a plain duplicate. Everything else in each of those
 * 3 blocks (loading text, the `AuthPanel`, the description paragraph +
 * search input), plus the month filter described above.
 */
export default function HistoryPage() {
  const { user, isAnonymousSession, loading: authLoading, openAuthSheet } = useAuth();
  const { products: liveProducts, loadingProducts: liveProductsLoading } = useSearch();

  const [history, setHistory] = useState<DealCheckRow[] | null>(null);
  const [availableMonthKeys, setAvailableMonthKeys] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [fallbackProducts, setFallbackProducts] = useState<ProductCardData[]>([]);
  const retry = useCallback(() => {
    setError(null);
    setHistory(null);
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const range = selectedMonth ? monthRange(selectedMonth) : null;
    fetchDealCheckHistory(getSupabaseClient(), range ? { ...range, limit: 500 } : 500)
      .then((rows) => {
        if (!cancelled) {
          // A month change can leave fallback product metadata from the
          // previous result briefly in memory. Clear it with the new history
          // so a just-selected month can never render a stale product.
          setFallbackProducts([]);
          setHistory(rows);
          if (!selectedMonth) setAvailableMonthKeys([...new Set(rows.map((row) => getHistoryMonthKey(row.checked_at)))]);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeFetchError(err, "Failed to load your check history"));
      });
    return () => {
      cancelled = true;
    };
  }, [user, retryTick, selectedMonth]);

  // Gap-fill: any checked product not in the currently-loaded live specials
  // set (rolled off special since it was checked) gets looked up
  // separately. Runs once history resolves, not on every render -- keyed
  // off the actual set of missing ids so it doesn't re-fire pointlessly
  // when `liveProducts` itself updates for unrelated reasons.
  const missingIds = useMemo(() => {
    // Waits for the global specials fetch (`useSearch()`, loaded once in
    // layout.tsx) to actually finish before deciding what's "missing" --
    // otherwise every checked product looks missing during the brief
    // window `liveProducts` is still `[]` on a fresh load, triggering a
    // pointless full gap-fill fetch that a moment later becomes mostly
    // redundant once the real specials list arrives.
    if (!history || liveProductsLoading) return [];
    const liveIds = new Set(liveProducts.map((p) => p.id));
    return [...new Set(history.map((h) => h.product_id).filter((id) => !liveIds.has(id)))];
  }, [history, liveProducts, liveProductsLoading]);
  const missingIdsKey = missingIds.join(",");
  useEffect(() => {
    if (!missingIds.length) return;
    let cancelled = false;
    fetchNonSpecialProductCards(supabaseConfig, missingIds)
      .then((rows) => {
        if (!cancelled) setFallbackProducts(rows);
      })
      .catch(() => {
        // Best-effort only -- a failed gap-fill just means those specific
        // rows fall back to being skipped below (real data only, see this
        // file's own header comment), not a page-level error. The history
        // list itself already loaded successfully by this point.
        if (!cancelled) setFallbackProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [missingIds, missingIdsKey]);

  const productById = useMemo(() => {
    const map = new Map<string, ProductCardData>();
    for (const p of liveProducts) map.set(p.id, p);
    for (const p of fallbackProducts) if (!map.has(p.id)) map.set(p.id, p);
    return map;
  }, [liveProducts, fallbackProducts]);

  const [searchQuery, setSearchQuery] = useState("");
  const displayHistory = useMemo(() => collapseConsecutiveDealChecks(history || []), [history]);
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return displayHistory;
    return displayHistory.filter((h) => {
      const product = productById.get(h.product_id);
      if (!product) return false;
      return productMatchesSearch(product, searchQuery);
    });
  }, [displayHistory, searchQuery, productById]);
  const monthOptions = useMemo(() => buildHistoryMonthOptions(availableMonthKeys), [availableMonthKeys]);

  if (authLoading) {
    return <main className="pb-8" />;
  }

  // 2026-08-19, per Jay: bottom sheet, not a full-page swap -- see
  // lists/page.tsx's own version of this comment.
  if (!user) {
    const prompt = "Log in to review every supermarket deal and price you've checked.";
    return (
      <main className="flex flex-col gap-4 pt-6 pb-8">
        {/* `blurred`, 2026-08-20 -- see this file's other 2 `<SearchBar>`
            call sites for the full "why" (same change, same reasoning, all
            3 branches of this page). */}
        <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-center">
          <Image
            src="/all-checks-login.webp"
            alt="A checklist with a magnifying glass"
            width={483}
            height={512}
            sizes="144px"
            preload
            className="h-auto w-full max-w-[9rem]"
          />
          <p className="max-w-xs px-4 text-sm font-bold text-stone-700">{prompt}</p>
          <button
            type="button"
            onClick={() => openAuthSheet(prompt)}
            className="dd-btn dd-btn-primary cursor-pointer"
          >
            Log in or create an account
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 pb-6">
      {/* `blurred`, 2026-08-20 -- see this file's other 2 `<SearchBar>` call
          sites for the full "why" (same change, same reasoning, all 3
          branches of this page). */}
      <header className="flex flex-col gap-3 px-5 pt-6">
        <p className="text-sm leading-relaxed text-stone-600">
          Every supermarket deal and price you&rsquo;ve checked, most recent first.
        </p>
        <div className="flex items-center rounded-full border border-transparent bg-white py-2.5 pl-5 pr-3 shadow-sm transition-colors focus-within:border-stone-900">
          <Search className="mr-3 h-5 w-5 flex-shrink-0 text-stone-400" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your check history…"
            className="mobile-zoom-safe-input h-10 w-full border-none bg-transparent font-sans text-sm font-medium text-stone-500 placeholder:text-stone-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <label
            htmlFor="history-month"
            className="flex min-w-0 shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-stone-700 shadow-sm"
          >
            <CalendarDays className="h-4 w-4 flex-shrink-0 text-stone-500" aria-hidden="true" />
            <span className="sr-only">Jump to month</span>
            <select
              id="history-month"
              value={selectedMonth ?? ""}
              onChange={(event) => {
                setHistory(null);
                setSelectedMonth(event.target.value || null);
              }}
              aria-label="Jump to month"
              className="mobile-zoom-safe-input w-max max-w-[calc(100vw-11rem)] border-none bg-transparent text-xs font-bold text-stone-700 focus:outline-none"
            >
              <option value="">month</option>
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value} disabled={month.disabled}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          {selectedMonth && (
            <button
              type="button"
              onClick={() => {
                setHistory(null);
                setSelectedMonth(null);
              }}
              className="shrink-0 px-1 py-2.5 text-xs font-bold text-stone-600 underline underline-offset-2 transition-colors hover:text-stone-900"
            >
              Clear all
            </button>
          )}
        </div>
      </header>

      {isAnonymousSession && (
        // Same amber "dev tool" language/styling as lists/page.tsx and
        // /me's own Test Mode notice. Copy updated 2026-08-13 -- the test
        // account is a real Supabase anonymous sign-in now (see
        // auth-context.tsx's own doc comment), so it genuinely accumulates
        // real check history like any other signed-in user; this no longer
        // claims history "will always be empty," it just flags the account
        // itself has no email attached.
        <div className="mx-5 flex flex-col gap-1 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-[11px] font-black tracking-widest text-amber-700">Test mode</p>
          <p className="text-[13px] leading-relaxed text-amber-700">
            You&rsquo;re using an anonymous test account — checks you make here really do save to your history, but
            this account has no email attached, so you can&rsquo;t sign back into it from another device.
          </p>
        </div>
      )}

      {error && <ErrorState message="Couldn't load your check history." detail={error} onRetry={retry} />}

      {history !== null && !error && (
        history.length === 0 ? (
          <div className="mx-5 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 bg-white py-12 text-center">
            <p className="max-w-xs px-4 text-[13px] leading-4 font-bold tracking-widest text-stone-500">
              Your checking history is empty
            </p>
            <p className="max-w-xs px-4 text-[13px] leading-4 text-stone-500">
              Search for a product or scan a barcode from Home to check your first deal.
            </p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="mx-5 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 bg-white py-12 text-center">
            <p className="max-w-xs px-4 text-[13px] leading-4 font-bold tracking-widest text-stone-500">
              No matching checks found
            </p>
            <p className="max-w-xs px-4 text-[13px] leading-4 text-stone-500">Try searching for a different product name or brand.</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex flex-col gap-3 px-5"
          >
            {filteredHistory.map((h, index) => {
              const product = productById.get(h.product_id);
              if (!product) return null;
              const deal = buildHistoricalDeal(h);
              const previous = filteredHistory[index - 1];
              const dayKey = getLocalDayKey(h.checked_at);
              const previousDayKey = previous ? getLocalDayKey(previous.checked_at) : null;
              return (
                <div key={h.id} className="flex flex-col gap-2">
                  {dayKey !== previousDayKey && (
                    <p className="pt-2 text-xs font-black uppercase tracking-[0.14em] text-stone-500">
                      {formatHistoryDay(h.checked_at)}
                    </p>
                  )}
                  <HistoryProductCard product={product} deal={deal} />
                </div>
              );
            })}
          </motion.div>
        )
      )}
    </main>
  );
}

/** Builds a `CurrentDeal`-shaped object from a `deal_checks` row's own
 * snapshotted values, NOT looked up from the live product's current deals
 * -- this row IS the historical record of what was actually checked, at
 * whatever price/store that was, which may no longer match today's live
 * price at all. Only the fields `HistoryProductCard` actually reads
 * (`store`/`price`/`dealType`, confirmed against that component's own
 * source) matter for display; the rest are filled with honest, inert
 * defaults rather than fabricated ones. */
function buildHistoricalDeal(h: DealCheckRow): CurrentDeal {
  return {
    store: h.store,
    price: h.price,
    originalPrice: h.original_price,
    discountPercentage:
      h.original_price > 0 ? Math.round(((h.original_price - h.price) / h.original_price) * 100) : 0,
    dealType: h.deal_type,
    wasArtificiallyInflated: false,
    reason: "",
    explanation: null,
    isOnSpecial: h.deal_type !== "Fair Price",
    saleStartedAt: null,
    specialEndDate: null,
    // Price History Insights (2026-08-19) -- this is a deal_checks snapshot,
    // not a live dodgy_deals row, so there's no real 90-day stat behind it.
    // Honest null, same as fetchNonSpecialProductCards's own non-special
    // cards, not fabricated from the snapshot's single price point.
    ninetyDayLow: null,
    ninetyDayHigh: null,
    ninetyDayAvg: null,
    ninetyDaySamples: null,
    ninetyDaySpecialSamples: null,
    ninetyDayDaysTracked: null,
    ninetyDaySpecialDays: null,
  };
}

function monthRange(month: string): { startAt: string; endAt: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  // Build boundaries in the user's local timezone because the date labels
  // below are local too; using UTC here would shift the first/last local day
  // into the neighbouring month for users outside UTC.
  const startAt = new Date(year, monthNumber - 1, 1).toISOString();
  const endAt = new Date(year, monthNumber, 1).toISOString();
  return { startAt, endAt };
}

function getHistoryMonthKey(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate.slice(0, 7);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function buildHistoryMonthOptions(monthKeys: string[]): { value: string; label: string; disabled: boolean }[] {
  const validKeys = [...new Set(monthKeys)].filter((key) => /^\d{4}-\d{2}$/.test(key)).sort();
  if (!validKeys.length) return [];

  const [firstYear, firstMonth] = validKeys[0].split("-").map(Number);
  const [lastYear, lastMonth] = validKeys[validKeys.length - 1].split("-").map(Number);
  const firstIndex = firstYear * 12 + firstMonth - 1;
  const lastIndex = lastYear * 12 + lastMonth - 1;
  const available = new Set(validKeys);
  const formatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  const options: { value: string; label: string; disabled: boolean }[] = [];

  for (let index = lastIndex; index >= firstIndex; index -= 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const value = `${year}-${String(month).padStart(2, "0")}`;
    options.push({
      value,
      label: formatter.format(new Date(year, month - 1, 1)),
      disabled: !available.has(value),
    });
  }
  return options;
}

function getLocalDayKey(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHistoryDay(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
