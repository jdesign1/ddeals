"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Check, RefreshCw } from "lucide-react";
import { useSearch } from "@/lib/search-context";

const PULL_TRIGGER_PX = 72;
const PULL_MAX_PX = 112;

/**
 * Extracted 2026-08-17 from `layout.tsx`'s own inline
 * `<div className="flex-1 overflow-y-auto pb-safe-nav">{children}</div>`,
 * per Jay's ask to remove `BottomNav` from the deal-assessment page
 * (`BottomNav.tsx`'s own doc comment has the full story on why the nav
 * itself hides per-route there instead of at its `layout.tsx` mount site).
 *
 * `layout.tsx` is a plain server component (it exports `metadata`, no
 * `"use client"`), so it can't call `usePathname()` itself to decide which
 * bottom padding this scroll container needs. This one-purpose wrapper is
 * the client boundary for that single route check, kept as small as
 * possible rather than converting the whole root layout to a client
 * component just for this.
 *
 * `pb-safe-nav` (globals.css, `calc(5.5rem + env(safe-area-inset-bottom))`)
 * reserves exactly enough space for `BottomNav`'s floating-pill footprint
 * so real content never sits underneath/obscured by it at rest -- see that
 * class's own comment. On the deal-assessment route, where `BottomNav` now
 * renders nothing, keeping that same 5.5rem reservation would leave a dead
 * empty gap at the bottom of the page instead of a floating nav. Swapped to
 * `pb-safe-sm` (globals.css, `calc(0.5rem + env(safe-area-inset-bottom))`)
 * on that route only -- an existing class, already in globals.css before
 * this session but unused anywhere in the app until now, sized for exactly
 * this "safe-area clearance only, no nav" case rather than a new one
 * invented here.
 */
export default function ScrollContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hasBottomNav = !pathname.startsWith("/deal/");
  const { refreshCatalogue } = useSearch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<"updated" | "throttled" | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    []
  );

  const resetPull = () => {
    touchStartYRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (refreshing || feedback || (scrollRef.current?.scrollTop ?? 0) > 0) return;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current === null || refreshing) return;
    const currentY = event.touches[0]?.clientY;
    if (currentY === undefined) return;
    const distance = currentY - touchStartYRef.current;
    if (distance <= 0 || (scrollRef.current?.scrollTop ?? 0) > 0) {
      resetPull();
      return;
    }
    const easedDistance = Math.min(PULL_MAX_PX, distance * 0.5);
    pullDistanceRef.current = easedDistance;
    setPullDistance(easedDistance);
  };

  const handleTouchEnd = async () => {
    const shouldRefresh = pullDistanceRef.current >= PULL_TRIGGER_PX;
    resetPull();
    if (!shouldRefresh || refreshing) return;

    setRefreshing(true);
    setFeedback(null);
    try {
      const result = await refreshCatalogue();
      setFeedback(result.throttled ? "throttled" : "updated");
    } catch {
      // Route-level data consumers retain their current data and can use the
      // next pull or their existing error retry if the request failed.
    } finally {
      setRefreshing(false);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1600);
    }
  };

  return (
    <div
      ref={scrollRef}
      className={`relative flex-1 overflow-y-auto overscroll-y-contain ${hasBottomNav ? "pb-safe-nav" : "pb-safe-sm"}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
      onTouchCancel={resetPull}
    >
      {(pullDistance > 0 || refreshing || feedback) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center"
          aria-live="polite"
          aria-label={refreshing ? "Refreshing specials" : feedback === "updated" ? "Specials updated" : "Already up to date"}
        >
          <div className="flex h-9 items-center gap-2 rounded-full bg-white px-3 text-xs font-bold text-stone-700 shadow-md ring-1 ring-stone-200">
            {refreshing ? <RefreshCw size={15} className="animate-spin" /> : feedback === "updated" ? <Check size={15} /> : <RefreshCw size={15} />}
            <span>{refreshing ? "Refreshing" : feedback === "updated" ? "Updated" : feedback === "throttled" ? "Already up to date" : "Pull to refresh"}</span>
          </div>
        </div>
      )}
      <div style={{ transform: pullDistance ? `translateY(${pullDistance}px)` : undefined }}>{children}</div>
    </div>
  );
}
