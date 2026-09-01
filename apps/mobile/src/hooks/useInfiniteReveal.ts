"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Infinite-scroll reveal for the app's client-side-only result lists (Home's
 * Trending rail, full-screen search's Popular/Dodgy tab, full-screen
 * search's results list, and `/specials`) — replaces the old "Show all N
 * deals" button (jump straight to the full array) with a scroll-triggered
 * incremental reveal, per Jay's 2026-08-21 ask. See project.md's same-dated
 * entry for the full discussion this came out of; the short version:
 *
 * EVERY list this hook backs already has its FULL dataset sitting in memory
 * before this hook ever runs — `loadLiveProducts()` (`packages/shared/src/
 * data.ts`) fetches the whole current-specials catalogue once per session-
 * hour (materialized-view read + IndexedDB cross-session cache + in-memory
 * request dedupe), and every one of these lists is a `useMemo` filter/sort
 * over that one array. So growing `visibleCount` here — whether by a button
 * tap or, as built, an `IntersectionObserver` on a sentinel element — is a
 * PURE client-side re-render of a longer `.slice(0, n)`. Zero new Supabase
 * calls, zero incremental egress, per batch or in total. That's what makes
 * plain scroll-triggered reveal safe/free here, unlike infinite scroll
 * backed by a real paginated API (where each batch IS a new network call) —
 * do not copy this pattern onto a screen backed by on-demand server paging
 * without re-deriving that cost tradeoff for that screen.
 *
 * What this DOES cost, and why `maxItems` exists: DOM node count / React
 * reconciliation. These arrays are not small — live production counts
 * checked 2026-08-21 via the `dodgy_deals_cache` REST endpoint directly:
 * Home's unfiltered Trending pool alone was 4,596 qualifying rows, the
 * search "Dodgy" tab's pool was 1,693, and `/specials` (which had NO cap at
 * all before this change) renders the full ~9,211-row catalogue. Revealing
 * literally everything would mean thousands of mounted cards (each with its
 * own `next/image`, add-to-list button, animation wiring) in one browser
 * session — a real memory/jank/possible-tab-crash risk on a mid/low-end
 * phone, even though `next/image`'s own default lazy-loading means the
 * *images* themselves stay cheap regardless. `maxItems` hard-stops growth
 * there; the caller is expected to show a "narrow your search/filters"
 * nudge once `isCapped` is true rather than silently going quiet.
 *
 * `resetKey` should be the ALREADY-MEMOIZED filtered/sorted array itself
 * (not its `.length`, not a hand-picked list of the filters that produced
 * it) — e.g. `useInfiniteReveal({ totalCount: sorted.length, resetKey:
 * sorted, ... })`. `useMemo` only returns a new array reference when its own
 * deps actually changed, so piggybacking on that reference as the reset
 * trigger means "start over at the top whenever the result set changes for
 * ANY reason" (new search query, store/category/price filter, sort order)
 * without this hook needing its own separate, driftable copy of that same
 * dependency list.
 *
 * Deliberately no IntersectionObserver-unsupported fallback (e.g. reverting
 * to a manual button): every browser this app ships to (modern mobile
 * Safari/Chrome) has supported it for years, and the `typeof
 * IntersectionObserver === "undefined"` guard below exists only so this
 * doesn't throw under SSR / the Node test runner (no `window` there), not as
 * a real user-facing fallback path. Revisit if that browser-support
 * assumption ever stops holding.
 */

/** Shared across all 4 call sites so there's one knob to retune, not four
 * independently-drifting magic numbers — see this file's own top comment
 * for why 200 was picked (order-of-magnitude below the real pool sizes
 * measured 2026-08-21, comfortably above what any real user scrolls to). */
export const INFINITE_REVEAL_MAX_ITEMS = 200;

interface UseInfiniteRevealArgs {
  /** Length of the already-filtered/sorted array being revealed. */
  totalCount: number;
  /** How many additional items each scroll-triggered reveal adds. */
  chunkSize: number;
  /** Hard ceiling on how many items this hook will ever reveal, regardless
   * of `totalCount` — see top-of-file comment. */
  maxItems: number;
  /** Reveal resets to one `chunkSize` batch whenever this value's identity
   * changes — pass the memoized result array itself (see top-of-file
   * comment), not a derived primitive. */
  resetKey: unknown;
  /** Optional stable key for keeping the revealed count when a route
   * temporarily unmounts the list (for example, while opening a deal and
   * returning to Check Deals). The key should include the list's filters and
   * sort order so a different result set still starts at its first page. */
  persistenceKey?: string;
}

// App-router route changes unmount Home's list, but the user experience for
// returning from a deal should be the same as returning to the existing list.
// Keep this small in-memory cache alongside the hook rather than using
// sessionStorage: it survives the route transition in the iOS webview without
// serialising the result set or leaking state across a fresh app launch.
const persistedVisibleCounts = new Map<string, number>();

export function useInfiniteReveal({ totalCount, chunkSize, maxItems, resetKey, persistenceKey }: UseInfiniteRevealArgs): {
  visibleCount: number;
  /** Ref callback — attach to the sentinel element that should trigger the
   * next reveal when it scrolls into view. */
  sentinelRef: (node: HTMLDivElement | null) => void;
  /** True once `maxItems` has been reached with more real items still
   * beyond it — caller should show a "narrow your search" nudge here
   * instead of a sentinel (there's nothing left this hook will reveal). */
  isCapped: boolean;
} {
  const [visibleCount, setVisibleCount] = useState(() =>
    persistenceKey ? persistedVisibleCounts.get(persistenceKey) ?? chunkSize : chunkSize
  );

  // Kept current every render so the IntersectionObserver callback below
  // (attached once per sentinel-mount via the ref callback, not re-created
  // on every render) always reads the LATEST totalCount/chunkSize/maxItems
  // rather than whatever was passed in on the render that happened to be
  // current when the sentinel first mounted -- e.g. `totalCount` changes on
  // every keystroke of a search query, but the sentinel element itself
  // doesn't remount just because the count changed.
  const totalCountRef = useRef(totalCount);
  const chunkSizeRef = useRef(chunkSize);
  const maxItemsRef = useRef(maxItems);
  const persistenceKeyRef = useRef(persistenceKey);
  totalCountRef.current = totalCount;
  chunkSizeRef.current = chunkSize;
  maxItemsRef.current = maxItems;
  persistenceKeyRef.current = persistenceKey;

  // Guards against one scroll gesture firing the observer callback more
  // than once before `visibleCount`'s DOM growth has had a chance to move
  // the sentinel out of the (600px-padded) trigger zone -- without this a
  // fast flick can fire several times in one tick and jump straight past
  // several intended chunk boundaries at once.
  const loadingRef = useRef(false);

  useEffect(() => {
    const restoredCount = persistenceKey ? persistedVisibleCounts.get(persistenceKey) ?? chunkSize : chunkSize;
    setVisibleCount(restoredCount);
    if (persistenceKey) persistedVisibleCounts.set(persistenceKey, restoredCount);
    // Deliberately NOT depending on totalCount/maxItems here -- resetKey
    // (the memoized result array itself) already changes exactly when the
    // result set does, and chunkSize is the one other value a caller might
    // legitimately change independent of the result set (e.g. switching
    // FullScreenSearch's popular tab between "specials"/"dodgy", which uses
    // two different page sizes for what can otherwise be the same resetKey
    // shape) and should also restart the reveal from the top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, chunkSize, persistenceKey]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingRef.current) return;
        loadingRef.current = true;
        setVisibleCount((prev) => {
          const next = Math.min(prev + chunkSizeRef.current, totalCountRef.current, maxItemsRef.current);
          if (persistenceKeyRef.current) persistedVisibleCounts.set(persistenceKeyRef.current, next);
          return next;
        });
        // Released next frame -- long enough for the just-grown DOM to push
        // the sentinel out of the viewport in the normal case, short enough
        // that a sentinel still genuinely on-screen (short chunk, tall
        // screen) triggers its next reveal promptly instead of stalling
        // until an unrelated scroll event happens to fire the observer again.
        requestAnimationFrame(() => {
          loadingRef.current = false;
        });
      },
      // Starts loading ~600px before the sentinel is actually on-screen so
      // the user doesn't hit a visible "loading gap" mid-scroll.
      { rootMargin: "600px" }
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  // Clamped on every render (not just after the reset effect runs) so the
  // returned value is always safe even mid-transition -- e.g. `totalCount`
  // shrinking (a filter just narrowed the result set) is reflected
  // immediately, not one render late.
  const clampedVisibleCount = Math.min(visibleCount, totalCount, maxItems);

  return {
    visibleCount: clampedVisibleCount,
    sentinelRef,
    isCapped: totalCount > maxItems && clampedVisibleCount >= maxItems,
  };
}
