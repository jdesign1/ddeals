"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { fetchDealCheckHistory, computeDealStats, describeFetchError, type DealStats } from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";

/**
 * Me / Deal Stats — ported from Prototype/index.html's `ProfileTab`
 * (2026-08-11, per Jay's ask to port both "All Checks" and "Deal Stats").
 * Replaces the S9 placeholder this route always was ("Me: Profile &
 * Savings Hub" per project.md's Stitch screen inventory — Deal Stats is
 * exactly the "savings hub" content that placeholder was reserved for, per
 * Jay's own call on where these two ported screens should live: Deal Stats
 * becomes this real page, "All Checks" gets its own route (`/history`)
 * linked from here rather than a 5th bottom-nav tab).
 *
 * Real data throughout, backed by `deal_checks` (see
 * `packages/shared/src/deal-checks.ts`'s own header comment for why that
 * table exists and what it does and doesn't track) — no fabricated
 * numbers. Two real, deliberate differences from the prototype's own
 * `ProfileTab`, both flagged rather than silently changed:
 *  - The prototype's first stat is labelled "Items Added to Lists" but
 *    actually reads `stats.totalChecked` (a checked-deals count, not a
 *    lists count — a pre-existing label/value mismatch in the prototype
 *    itself, not something this port needs to carry over). Relabelled
 *    "Deals Checked" here to match what the number actually is.
 *  - "Estimated Savings"' explanation text describes a DIFFERENT
 *    calculation than the prototype's own copy claims — see
 *    `computeDealStats`'s own doc comment in deal-checks.ts for exactly
 *    why (this table only ever snapshots the one store/price actually
 *    checked, not every store's price at that moment, so the prototype's
 *    "highest minus lowest price found" isn't reproducible here).
 *
 * The 2 plain "Me" `<h1>`s (loading state, signed-out state) are gone as
 * of 2026-08-13, per Jay's "remove the h1 titles from each page, as we
 * have the title in the top nav bar" -- `AppHeader.tsx` already shows
 * "Deal stats" for this route via `ROUTE_TITLES`, so a same-page "Me"
 * label (already stale next to that title anyway) was a plain duplicate.
 * The hero `<h1>` further down ("This is how Dodgy Deal works for you")
 * is deliberately kept -- it's a distinct tagline, not a restated page
 * name, so it isn't the kind of duplicate this request was about.
 */
export default function MePage() {
  const { user, isAnonymousSession, loading: authLoading, openAuthSheet } = useAuth();
  const [stats, setStats] = useState<DealStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Same plain-counter retry pattern established across this app on
  // 2026-08-11 (search-context.tsx/specials/page.tsx/lists/page.tsx) —
  // lets ErrorState's Try Again button re-run the fetch below.
  const [retryTick, setRetryTick] = useState(0);
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    fetchDealCheckHistory(getSupabaseClient())
      .then((history) => {
        if (!cancelled) {
          setStats(computeDealStats(history));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeFetchError(err, "Failed to load your deal stats"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, retryTick]);

  if (authLoading) {
    return (
      <main className="flex flex-col gap-3 pb-8">
        {/* `blurred` added 2026-08-20, per Jay: "All checks and Deal stats
            pages - remove the search bar's white background (container
            fill) to match the Check deals page." -- was a bare
            `<SearchBar />` (default variant, not blurred), which renders
            an opaque `bg-white` sticky wrapper (`SearchBar.tsx`'s own
            ternary); `blurred` swaps that for the same transparent +
            `backdrop-blur-md` treatment Home's search bar already uses.
            Scoped to just the wrapper fill -- this page's pill still keeps
            its own `border-stone-300` at rest (unlike Home's, see
            `page.tsx`'s own same-day `variant="shadow"` change) since Jay's
            two asks were separate: this one about the container fill only,
            not the pill's stroke. Same change, same reasoning, at this
            file's other 2 `<SearchBar>` call sites below (short pointer
            comment there instead of repeating this in full 3 times). */}
        <div className="flex flex-col gap-3 px-5 pt-4">
          <LoadingMascot loading />
        </div>
      </main>
    );
  }

  // 2026-08-19, per Jay: bottom sheet, not a full-page swap -- see
  // lists/page.tsx's own version of this comment.
  if (!user) {
    const prompt = "Log in to see your Deal Stats — track checked deals, real savers spotted, and estimated total savings.";
    return (
      <main className="flex flex-col gap-4 pt-6 pb-8">
        {/* `blurred`, 2026-08-20 -- see this file's other 2 `<SearchBar>`
            call sites for the full "why" (same change, same reasoning, all
            3 branches of this page). */}
        <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-center">
          <Image
            src="/deal-stats-login.webp"
            alt="An ascending savings chart with a check mark"
            width={512}
            height={468}
            sizes="144px"
            preload
            className="mascot-wave h-auto w-full max-w-[9rem]"
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
    <main className="flex flex-col gap-6 pb-8">
      {/* `blurred`, 2026-08-20 -- see this file's other 2 `<SearchBar>` call
          sites for the full "why" (same change, same reasoning, all 3
          branches of this page). */}
      <header className="px-5 pt-6 text-center">
        {/* An infrequent blink keeps the mascot lively without making the
            static Deal Stats header feel like a loading indicator. */}
        <Image src="/logo.svg" alt="" width={48} height={48} className="animate-mascot-blink mx-auto mb-2 h-12 w-12" />
        <h1 className="font-display text-lg font-black tracking-normal text-stone-900">
          This is how Dodgy Deal works for you
        </h1>
      </header>

      {isAnonymousSession && (
        // Same amber "dev tool" language/styling as lists/page.tsx and
        // /history's own Test Mode notice. Copy updated 2026-08-13 -- the
        // test account is a real Supabase anonymous sign-in now (see
        // auth-context.tsx's own doc comment), so these stats genuinely
        // reflect real check history like any other signed-in user; this
        // no longer claims stats "will always show zero," it just flags
        // the account itself has no email attached.
        <div className="mx-5 flex flex-col gap-1 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-sm font-black tracking-widest text-amber-700">Test mode</p>
          <p className="text-sm leading-relaxed text-amber-700">
            You&rsquo;re using an anonymous test account — the stats below are real, but this account has no email
            attached, so you can&rsquo;t sign back into it from another device.
          </p>
        </div>
      )}

      <LoadingMascot loading={loading} />
      {error && <ErrorState message="Couldn't load your deal stats." detail={error} onRetry={retry} />}

      {!loading && !error && stats && (
        <div className="flex flex-col gap-4 px-5">
          <div className="grid grid-cols-3 divide-x divide-stone-100 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
            <StatCell label="Deals checked" value={stats.totalChecked} valueClassName="text-stone-900" />
            <StatCell label="Real savers found" value={stats.realSavers} valueClassName="text-fair-600" labelClassName="text-fair-600" />
            <StatCell label="Dodgy deals spotted" value={stats.dodgySpotted} valueClassName="text-alert-600" labelClassName="text-alert-600" />
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-black text-stone-900">Break down by supermarket</h2>
            <div className="grid grid-cols-12 gap-2 border-b border-stone-100 pb-1 text-sm font-black text-stone-500">
              <span className="col-span-6">Supermarket</span>
              <span className="col-span-3 text-center">Real savers</span>
              <span className="col-span-3 text-center">Dodgy deals</span>
            </div>
            <div className="flex flex-col gap-2">
              {stats.storeStats.map((store) => (
                <div key={store.store} className="grid grid-cols-12 items-center gap-2 border-b border-stone-50 py-1.5 last:border-0">
                  <span className="col-span-6 font-display text-sm font-bold text-stone-800">{store.store}</span>
                  <div className="col-span-3 text-center">
                    <span className="inline-block min-w-[32px] rounded-md bg-fair-50 px-2.5 py-0.5 text-sm font-black tabular-nums text-fair-600">
                      {store.real}
                    </span>
                  </div>
                  <div className="col-span-3 text-center">
                    <span className="inline-block min-w-[32px] rounded-md bg-alert-50 px-2.5 py-0.5 text-sm font-black tabular-nums text-alert-600">
                      {store.dodgy}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-fair-100/80 bg-fair-50/40 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-extrabold text-fair-950">Estimated Savings</span>
              <span className="font-display text-3xl font-black tabular-nums text-fair-700">
                ${stats.moneySaved.toFixed(2)}
              </span>
            </div>
            <div className="rounded-xl border border-fair-100 bg-white/95 p-4">
              <p className="mb-1.5 text-sm font-black tracking-wider text-fair-800">How we calculate this</p>
              <p className="text-sm font-semibold leading-relaxed text-stone-600">
                Every time you check a deal, we compare its price against the recent price it&rsquo;s being discounted
                from. This is the sum of every real saving across everything you&rsquo;ve checked.
              </p>
            </div>
          </div>

          <Link
            href="/history"
            className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-5 py-4 text-sm font-bold text-stone-800 shadow-xs transition-colors hover:bg-stone-50"
          >
            <span>See all your checked deals</span>
            <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
          </Link>
        </div>
      )}
    </main>
  );
}

function StatCell({
  label,
  value,
  valueClassName,
  labelClassName = "text-stone-500",
}: {
  label: string;
  value: number;
  valueClassName: string;
  labelClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-2 px-1 text-center">
      <span className={`flex min-h-[32px] items-center justify-center text-sm font-black tracking-widest leading-tight ${labelClassName}`}>
        {label}
      </span>
      <span className={`font-display text-2xl font-black tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}
