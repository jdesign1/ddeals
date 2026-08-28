"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Check, RefreshCw } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BackToTopButton from "@/components/BackToTopButton";
import { useSearch } from "@/lib/search-context";
import { publishCheckDealsHeaderVisibility } from "@/lib/scroll-events";

const PULL_TRIGGER_PX = 72;
const PULL_MAX_PX = 112;
const HEADER_DIRECTION_THRESHOLD_PX = 20;
const HEADER_TRANSITION_MS = 300;

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
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef<"up" | "down" | null>(null);
  const directionDistanceRef = useRef(0);
  const headerHiddenRef = useRef(false);
  const headerAnimationGuardRef = useRef(false);
  const headerAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<"updated" | "throttled" | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (headerAnimationTimeoutRef.current) clearTimeout(headerAnimationTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (headerAnimationTimeoutRef.current) clearTimeout(headerAnimationTimeoutRef.current);
    headerAnimationGuardRef.current = false;
    lastScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
    scrollDirectionRef.current = null;
    directionDistanceRef.current = 0;
    headerHiddenRef.current = false;
    publishCheckDealsHeaderVisibility(false);
  }, [pathname]);

  // Collapsing the sticky header/search/toolbar changes the layout above the
  // current viewport and can make the browser emit a compensating scroll
  // event. Ignore those animation-generated events so they cannot be read as
  // a new user direction and immediately reverse the transition.
  const setHeaderHidden = (hidden: boolean) => {
    if (headerHiddenRef.current === hidden) return;
    headerHiddenRef.current = hidden;
    publishCheckDealsHeaderVisibility(hidden);
    headerAnimationGuardRef.current = true;
    if (headerAnimationTimeoutRef.current) clearTimeout(headerAnimationTimeoutRef.current);
    headerAnimationTimeoutRef.current = setTimeout(() => {
      headerAnimationGuardRef.current = false;
    }, HEADER_TRANSITION_MS + 50);
  };

  const handleScroll = () => {
    const currentScrollTop = scrollRef.current?.scrollTop ?? 0;
    const previousScrollTop = lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;

    if (pathname !== "/") return;
    if (headerAnimationGuardRef.current) {
      scrollDirectionRef.current = null;
      directionDistanceRef.current = 0;
      return;
    }
    if (currentScrollTop <= 8) {
      scrollDirectionRef.current = null;
      directionDistanceRef.current = 0;
      if (headerHiddenRef.current) setHeaderHidden(false);
      return;
    }

    const delta = currentScrollTop - previousScrollTop;
    if (Math.abs(delta) < 1) return;
    const direction = delta > 0 ? "down" : "up";
    if (scrollDirectionRef.current !== direction) {
      scrollDirectionRef.current = direction;
      directionDistanceRef.current = 0;
    }
    directionDistanceRef.current += Math.abs(delta);
    if (directionDistanceRef.current < HEADER_DIRECTION_THRESHOLD_PX) return;

    directionDistanceRef.current = 0;
    setHeaderHidden(direction === "down");
  };

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
      // Explicitly reserve vertical gestures for this scroll surface. This
      // keeps a drag that starts on a tappable product card from being
      // interpreted as card interaction instead of page scrolling.
      className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
      style={{ touchAction: "pan-y" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
      onTouchCancel={resetPull}
      onScroll={handleScroll}
    >
      <AppHeader />
      {(pullDistance > 0 || refreshing || feedback) && (
        <div
          className="pointer-events-none fixed inset-x-0 top-8 z-[9999] flex -translate-y-1/2 justify-center"
          aria-live="polite"
          aria-label={refreshing ? "Refreshing specials" : feedback === "updated" ? "Specials updated" : "Already up to date"}
        >
          <div className="flex h-9 items-center gap-2 rounded-full bg-white px-3 text-xs font-bold text-stone-700 shadow-md ring-1 ring-stone-200">
            {refreshing ? <RefreshCw size={15} className="animate-spin" /> : feedback === "updated" ? <Check size={15} /> : <RefreshCw size={15} />}
            <span>{refreshing ? "Refreshing" : feedback === "updated" ? "Updated" : feedback === "throttled" ? "Already up to date" : "Pull to refresh"}</span>
          </div>
        </div>
      )}
      <div
        className={hasBottomNav ? "pb-safe-nav" : "pb-safe-sm"}
        style={{ transform: pullDistance ? `translateY(${pullDistance}px)` : undefined }}
      >
        {children}
      </div>
      <BackToTopButton
        scrollRef={scrollRef}
        enabled={pathname === "/" || pathname === "/history"}
      />
    </div>
  );
}
