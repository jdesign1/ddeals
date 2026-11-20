"use client";

import { useEffect, useState } from "react";

interface LeaderboardEntry {
  position: number;
  display_name: string;
  city: string | null;
  best_streak: number;
  current_streak: number;
}

type LoadState =
  | { token: string; status: "loading"; entries: [] }
  | { token: string; status: "ready"; entries: LeaderboardEntry[]; hasMore: boolean }
  | { token: string; status: "error"; entries: []; message: string };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? "").join("") || "D";
}

export default function DealDetectiveStreakLeaderboard({ accessToken }: { accessToken: string | null }) {
  const [state, setState] = useState<LoadState>({ token: accessToken ?? "", status: "loading", entries: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    const controller = new AbortController();
    void fetch("/api/deal-detective/streaks", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { entries?: LeaderboardEntry[]; has_more?: boolean; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error ?? "The leaderboard couldn’t load right now.");
        setState({ token: accessToken, status: "ready", entries: Array.isArray(payload?.entries) ? payload.entries : [], hasMore: payload?.has_more === true });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          token: accessToken,
          status: "error",
          entries: [],
          message: error instanceof Error ? error.message : "The leaderboard couldn’t load right now.",
        });
      });

    return () => controller.abort();
  }, [accessToken]);

  const loadMore = async () => {
    if (!accessToken || state.status !== "ready" || !state.hasMore || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await fetch(`/api/deal-detective/streaks?offset=${state.entries.length}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { entries?: LeaderboardEntry[]; has_more?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "More streaks couldn’t load right now.");
      setState((current) => current.token === accessToken && current.status === "ready"
        ? {
            ...current,
            entries: [...current.entries, ...(Array.isArray(payload?.entries) ? payload.entries : [])],
            hasMore: payload?.has_more === true,
          }
        : current);
    } catch (error) {
      setLoadMoreError(error instanceof Error ? error.message : "More streaks couldn’t load right now.");
    } finally {
      setLoadingMore(false);
    }
  };

  if (!accessToken) {
    return <p className="rounded-2xl border border-stone-200 bg-white px-4 py-5 dd-type-secondary text-stone-600" role="status">Sign in to see the streak leaderboard.</p>;
  }
  if (state.token !== accessToken) {
    return <p className="rounded-2xl border border-stone-200 bg-white px-4 py-5 dd-type-secondary text-stone-600" role="status">Loading public streaks…</p>;
  }
  if (state.status === "loading") {
    return <p className="rounded-2xl border border-stone-200 bg-white px-4 py-5 dd-type-secondary text-stone-600" role="status">Loading public streaks…</p>;
  }
  if (state.status === "error") {
    return <p className="rounded-2xl border border-stone-200 bg-white px-4 py-5 dd-type-secondary text-stone-600" role="alert">{state.message}</p>;
  }
  if (state.entries.length === 0) {
    return <p className="rounded-2xl border border-stone-200 bg-white px-4 py-5 dd-type-secondary text-stone-600" role="status">No public streaks yet. Share a tip and play Deal Detective to join in.</p>;
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Deal Detective streak rankings">
      {state.entries.map((entry) => (
        <li key={`${entry.position}-${entry.display_name}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-3 shadow-xs">
          <span className="w-7 shrink-0 text-center font-display text-sm font-extrabold tabular-nums text-stone-500">{entry.position}</span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fair-100 dd-type-control dd-type-control-strong text-fair-800" aria-hidden="true">{initials(entry.display_name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate dd-type-control dd-type-control-strong text-stone-900">{entry.display_name}</span>
            <span className="block truncate dd-type-meta text-stone-500">{entry.city || "NZ shopper"}{entry.current_streak > 0 ? ` · ${entry.current_streak} on a roll` : ""}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-display text-lg font-extrabold tabular-nums text-amber-800">{entry.best_streak}</span>
            <span className="block dd-type-meta text-stone-500">best</span>
          </span>
        </li>
      ))}
      {loadMoreError && <li className="dd-type-meta text-alert-700" role="alert">{loadMoreError}</li>}
      {state.hasMore && (
        <li>
          <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="dd-btn dd-btn-outline-muted min-h-11 w-full cursor-pointer disabled:cursor-wait disabled:opacity-60">
            {loadingMore ? "Loading more…" : "Show more streaks"}
          </button>
        </li>
      )}
    </ol>
  );
}
