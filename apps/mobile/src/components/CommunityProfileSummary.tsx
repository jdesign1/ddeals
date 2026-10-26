"use client";

import { LoaderCircle, ThumbsUp, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchCommunityProfileSummary, type CommunityProfileSummary as CommunityProfileSummaryData } from "@/lib/community-notes-api";

export default function CommunityProfileSummary() {
  const { user, session, isAnonymousSession } = useAuth();
  const [summary, setSummary] = useState<CommunityProfileSummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    <div className="rounded-2xl bg-stone-50 p-4" aria-busy={loading}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-fair-50 text-fair-700 ring-1 ring-fair-100">
          <Trophy className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="dd-type-meta dd-type-meta-strong text-stone-500">Community contributor</p>
          <p className="mt-0.5 dd-type-secondary dd-type-secondary-strong text-stone-900">Your shopper tips</p>
          <p className="mt-1 dd-type-meta text-stone-500">Helpful votes on published tips contribute to this community ranking.</p>
        </div>
      </div>

      <div className="mt-4 min-h-[4.5rem]">
        {loading ? (
          <div className="flex min-h-[4.5rem] items-center justify-center gap-2 text-stone-500" role="status" aria-live="polite">
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="dd-type-meta">Loading community totals…</span>
          </div>
        ) : error ? (
          <p className="dd-type-meta leading-5 text-alert-600" role="alert">{error}</p>
        ) : (
          <div className="grid grid-cols-3 divide-x divide-stone-200 rounded-xl border border-stone-200 bg-white py-3">
            <div className="px-3 text-center">
              <p className="font-display text-xl font-extrabold tabular-nums text-stone-900">{summary?.tips_shared ?? 0}</p>
              <p className="mt-0.5 dd-type-meta text-stone-500">Tips shared</p>
            </div>
            <div className="px-3 text-center">
              <p className="flex items-center justify-center gap-1 font-display text-xl font-extrabold tabular-nums text-stone-900">
                <ThumbsUp className="h-4 w-4 text-fair-700" aria-hidden="true" />
                {summary?.helpful_received ?? 0}
              </p>
              <p className="mt-0.5 dd-type-meta text-stone-500">Helpful votes</p>
            </div>
            <div className="px-3 text-center">
              <p className="font-display text-xl font-extrabold tabular-nums text-stone-900">{summary?.rank ? `#${summary.rank}` : "—"}</p>
              <p className="mt-0.5 dd-type-meta text-stone-500">Community rank</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
