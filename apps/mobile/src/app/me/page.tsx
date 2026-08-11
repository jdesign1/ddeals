"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { fetchDealCheckHistory, computeDealStats, type DealStats } from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import AuthPanel from "@/components/AuthPanel";
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
 */
export default function MePage() {
  const { user, isFakeSession, loading: authLoading } = useAuth();
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load your deal stats");
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
      <main className="flex flex-col gap-3 px-5 py-8">
        <h1 className="text-2xl font-extrabold text-stone-900">Me</h1>
        <p className="text-sm text-stone-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex flex-col gap-4 px-5 py-8">
        <h1 className="text-2xl font-extrabold text-stone-900">Me</h1>
        <AuthPanel prompt="Log in to see your Deal Stats — track checked deals, real savers spotted, and estimated total savings." />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 pb-8">
      <header className="px-5 pt-6 text-center">
        <Image src="/logo.svg" alt="" width={48} height={48} className="mx-auto mb-2 h-12 w-12" />
        <h1 className="font-display text-lg font-black tracking-tight text-stone-900">
          This is how Dodgy Deal works for you
        </h1>
      </header>

      {isFakeSession && (
        // Same amber "dev tool" language/styling as lists/page.tsx's own
        // Test Mode notice (2026-08-11) -- without this, a fake-session
        // user just sees "0 checks / $0.00 saved" with no explanation why,
        // since `fetchDealCheckHistory` (a plain SELECT) silently returns
        // zero rows under RLS for an unauthenticated request rather than
        // throwing an error (unlike an INSERT, which would) -- caught in
        // peer review as a real, if minor, inconsistency with the rest of
        // this app's fake-session handling.
        <div className="mx-5 flex flex-col gap-1 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Test Mode</p>
          <p className="text-xs leading-relaxed text-amber-700">
            This is a simulated login for design testing, not a real account — these stats will always show zero
            since there&rsquo;s no real check history behind it.
          </p>
        </div>
      )}

      <LoadingMascot loading={loading} label="Loading your deal stats…" />
      {error && <ErrorState message="Couldn't load your deal stats." detail={error} onRetry={retry} />}

      {!loading && !error && stats && (
        <div className="flex flex-col gap-4 px-5">
          <div className="grid grid-cols-3 divide-x divide-stone-100 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
            <StatCell label="Deals Checked" value={stats.totalChecked} valueClassName="text-stone-900" />
            <StatCell label="Real Savers Found" value={stats.realSavers} valueClassName="text-fair-600" labelClassName="text-fair-600" />
            <StatCell label="Dodgy Deals Spotted" value={stats.dodgySpotted} valueClassName="text-alert-600" labelClassName="text-alert-600" />
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-black text-stone-900">Break down by supermarket</h2>
            <div className="grid grid-cols-12 gap-2 border-b border-stone-100 pb-1 text-[11px] font-black text-stone-400">
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
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-fair-800">How we calculate this</p>
              <p className="text-xs font-semibold leading-relaxed text-stone-600">
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
  labelClassName = "text-stone-400",
}: {
  label: string;
  value: number;
  valueClassName: string;
  labelClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-2 px-1 text-center">
      <span className={`flex min-h-[32px] items-center justify-center text-[10px] font-black uppercase tracking-widest leading-tight ${labelClassName}`}>
        {label}
      </span>
      <span className={`font-display text-2xl font-black tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}
