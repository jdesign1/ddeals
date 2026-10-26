"use client";

import { Lightbulb, LoaderCircle, Medal, ThumbsUp, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchCommunityProfileSummary, type CommunityProfileSummary as CommunityProfileSummaryData } from "@/lib/community-notes-api";
import { getCommunityDetectiveRank } from "@/lib/community-reputation";

export type CommunityProfileSummaryVariant = "light" | "dark";

export default function CommunityProfileSummary({ variant = "light" }: { variant?: CommunityProfileSummaryVariant } = {}) {
  const { user, session, isAnonymousSession } = useAuth();
  const [summary, setSummary] = useState<CommunityProfileSummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDark = variant === "dark";
  const detectiveRank = summary ? getCommunityDetectiveRank(summary.tips_shared, summary.helpful_received) : null;
  const requestKey = user && !isAnonymousSession && session?.access_token
    ? user.id
    : null;
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const loading = Boolean(user && !isAnonymousSession && (!session?.access_token || loadedRequestKey !== requestKey));

  useEffect(() => {
    if (!requestKey || !session?.access_token) return;

    const controller = new AbortController();
    fetchCommunityProfileSummary(session.access_token, controller.signal)
      .then((nextSummary) => {
        setSummary(nextSummary);
        setError(null);
        setLoadedRequestKey(requestKey);
      })
      .catch((nextError: unknown) => {
        if (nextError instanceof DOMException && nextError.name === "AbortError") return;
        setSummary(null);
        setError(nextError instanceof Error ? nextError.message : "Community profile is unavailable right now.");
        setLoadedRequestKey(requestKey);
      });

    return () => controller.abort();
  }, [requestKey, session?.access_token]);

  if (!user || isAnonymousSession) return null;

  return (
    <div className={isDark ? "rounded-2xl border border-white/10 bg-white/10 p-4 text-white" : "rounded-2xl bg-stone-50 p-4"} aria-busy={loading}>
      <div className="flex items-start gap-3">
        <span className={isDark ? "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-fair-400 text-ink-950 ring-1 ring-fair-300/60" : "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-fair-50 text-fair-700 ring-1 ring-fair-100"}>
          <Trophy className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className={isDark ? "mt-0.5 dd-type-secondary dd-type-secondary-strong text-white" : "mt-0.5 dd-type-secondary dd-type-secondary-strong text-stone-900"}>Your shopper tips</p>
          <p className={isDark ? "mt-1 dd-type-meta text-white/65" : "mt-1 dd-type-meta text-stone-500"}>Helpful votes on published tips contribute to your Deal Detective rank.</p>
        </div>
      </div>

      <div className="mt-3 min-h-7">
        {!loading && !error && detectiveRank && (
          <span className={isDark ? "inline-flex items-center gap-1.5 rounded-full border border-fair-300/30 bg-fair-300/10 px-3 py-1.5 dd-type-meta dd-type-meta-strong text-fair-200" : "inline-flex items-center gap-1.5 rounded-full border border-fair-200 bg-fair-50 px-3 py-1.5 dd-type-meta dd-type-meta-strong text-fair-800"}>
            <Medal className="h-4 w-4" aria-hidden="true" />
            <span>Deal Detective rank: {detectiveRank.label}</span>
          </span>
        )}
      </div>

      <div className="mt-4 min-h-[4.5rem]">
        {loading ? (
          <div className={isDark ? "flex min-h-[4.5rem] items-center justify-center gap-2 text-white/65" : "flex min-h-[4.5rem] items-center justify-center gap-2 text-stone-500"} role="status" aria-live="polite">
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="dd-type-meta">Loading community totals…</span>
          </div>
        ) : error ? (
          <p className={isDark ? "dd-type-meta leading-5 text-red-200" : "dd-type-meta leading-5 text-alert-600"} role="alert">{error}</p>
        ) : (
          <div className={isDark ? "grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-ink-950/30 py-3" : "grid grid-cols-3 divide-x divide-stone-200 rounded-xl border border-stone-200 bg-white py-3"}>
            <div className="px-3 text-center">
              <p className={isDark ? "flex items-center justify-center gap-1 font-display text-xl font-extrabold tabular-nums text-white" : "flex items-center justify-center gap-1 font-display text-xl font-extrabold tabular-nums text-stone-900"}>
                <Lightbulb className={isDark ? "h-4 w-4 text-fair-300" : "h-4 w-4 text-fair-700"} aria-hidden="true" />
                {summary?.tips_shared ?? 0}
              </p>
              <p className={isDark ? "mt-0.5 dd-type-meta text-white/65" : "mt-0.5 dd-type-meta text-stone-500"}>Tips shared</p>
            </div>
            <div className="px-3 text-center">
              <p className={isDark ? "flex items-center justify-center gap-1 font-display text-xl font-extrabold tabular-nums text-white" : "flex items-center justify-center gap-1 font-display text-xl font-extrabold tabular-nums text-stone-900"}>
                <ThumbsUp className={isDark ? "h-4 w-4 text-fair-300" : "h-4 w-4 text-fair-700"} aria-hidden="true" />
                {summary?.helpful_received ?? 0}
              </p>
              <p className={isDark ? "mt-0.5 dd-type-meta text-white/65" : "mt-0.5 dd-type-meta text-stone-500"}>Helpful votes</p>
            </div>
            <div className="px-3 text-center">
              <p className={isDark ? "font-display text-xl font-extrabold tabular-nums text-white" : "font-display text-xl font-extrabold tabular-nums text-stone-900"}>{summary?.rank ? `#${summary.rank}` : "—"}</p>
              <p className={isDark ? "mt-0.5 dd-type-meta text-white/65" : "mt-0.5 dd-type-meta text-stone-500"}>Community rank</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
