"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from "react";
import { Check, RefreshCw } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BackToTopButton from "@/components/BackToTopButton";
import SearchBar from "@/components/SearchBar";
import { useSearch } from "@/lib/search-context";
import { publishCheckDealsHeaderVisibility, publishCheckDealsScrollPosition } from "@/lib/scroll-events";

const PULL_TRIGGER_PX = 72;
const PULL_MAX_PX = 112;
const HEADER_SHOW_AT_TOP = 8;
const HEADER_SCROLL_DELTA = 4;
const HEADER_TRANSITION_MS = 480;

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
  const hasBottomNav = !pathname.startsWith("/deal/") && pathname !== "/settings";
  const { refreshCatalogue, dealFilter } = useSearch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTopRef = useRef(0);
  const checkDealsScrollTopRef = useRef(0);
  const previousPathnameRef = useRef(pathname);
  const headerHiddenRef = useRef(false);
  const headerScrollAnchorRef = useRef(0);
  const headerAnimationGuardRef = useRef(false);
  const headerAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkDealsChromeRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<"updated" | "throttled" | null>(null);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(64);
  const [chromeHeight, setChromeHeight] = useState(128);
  const checkDealsSearchBackground =
    dealFilter === "real" ? "deal-filter-real-surface" : dealFilter === "dodgy" ? "deal-filter-dodgy-surface" : "bg-stone-100";

  // The outer scroll surface stays mounted while App Router swaps the Home
  // page for a deal page. Save Check Deals' last position independently of
  // the live element because iOS clamps that element when the deal content
  // replaces the longer list. Restore after the route returns, with one
  // extra frame for the list's preserved reveal count to be in the DOM.
  useLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    if (previousPathname === "/" && pathname !== "/") {
      checkDealsScrollTopRef.current = lastScrollTopRef.current;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }

    if (pathname !== "/" || previousPathname === "/") return;

    let secondFrame: number | null = null;
    const restore = () => {
      const element = scrollRef.current;
      if (!element) return;
      const top = Math.min(checkDealsScrollTopRef.current, Math.max(0, element.scrollHeight - element.clientHeight));
      element.scrollTop = top;
      lastScrollTopRef.current = top;
      publishCheckDealsScrollPosition(top);
    };

    restore();
    const firstFrame = window.requestAnimationFrame(() => {
      restore();
      secondFrame = window.requestAnimationFrame(restore);
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [pathname]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (headerAnimationTimeoutRef.current) clearTimeout(headerAnimationTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (pathname !== "/") return;
    const chrome = checkDealsChromeRef.current;
    const header = chrome?.querySelector<HTMLElement>(".app-header-shell");
    if (!chrome || !header) return;

    const updateChromeMetrics = () => {
      setHeaderHeight(header.offsetHeight || 64);
      setChromeHeight(chrome.offsetHeight || 128);
    };
    updateChromeMetrics();
    const observer = new ResizeObserver(updateChromeMetrics);
    observer.observe(chrome);
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (headerAnimationTimeoutRef.current) clearTimeout(headerAnimationTimeoutRef.current);
    headerAnimationGuardRef.current = false;
    lastScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
    headerScrollAnchorRef.current = lastScrollTopRef.current;
    headerHiddenRef.current = false;
    setIsHeaderHidden(false);
    publishCheckDealsHeaderVisibility(false);
    publishCheckDealsScrollPosition(lastScrollTopRef.current);
  }, [pathname]);

  // Collapsing the sticky header/search/toolbar changes the layout above the
  // current viewport and can make the browser emit a compensating scroll
  // event. Ignore those animation-generated events so they cannot be read as
  // a new user direction and immediately reverse the transition.
  const setHeaderHidden = (hidden: boolean) => {
    if (headerHiddenRef.current === hidden) return;
    headerHiddenRef.current = hidden;
    setIsHeaderHidden(hidden);
    publishCheckDealsHeaderVisibility(hidden);
    headerAnimationGuardRef.current = true;
    if (headerAnimationTimeoutRef.current) clearTimeout(headerAnimationTimeoutRef.current);
    headerAnimationTimeoutRef.current = setTimeout(() => {
      headerAnimationGuardRef.current = false;
    }, HEADER_TRANSITION_MS + 50);
  };

  const handleScroll = () => {
    const currentScrollTop = scrollRef.current?.scrollTop ?? 0;
    lastScrollTopRef.current = currentScrollTop;
    if (pathname === "/") checkDealsScrollTopRef.current = currentScrollTop;
    publishCheckDealsScrollPosition(currentScrollTop);

    if (pathname !== "/") return;

    if (headerAnimationGuardRef.current) {
      headerScrollAnchorRef.current = currentScrollTop;
      return;
    }
    if (currentScrollTop <= HEADER_SHOW_AT_TOP) {
      headerScrollAnchorRef.current = currentScrollTop;
      if (headerHiddenRef.current) setHeaderHidden(false);
      return;
    }

    const delta = currentScrollTop - headerScrollAnchorRef.current;
    if (delta > HEADER_SCROLL_DELTA) {
      setHeaderHidden(true);
      headerScrollAnchorRef.current = currentScrollTop;
    } else if (delta < -HEADER_SCROLL_DELTA) {
      setHeaderHidden(false);
      headerScrollAnchorRef.current = currentScrollTop;
    }
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
      className={`mobile-scroll-surface page-paper-surface relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain transition-[background-color] duration-300 ease-out ${
        pathname === "/" ? checkDealsSearchBackground : ""
      }`}
      // Check Deals keeps the header/search/toolbar layout slots fixed while
      // their visual hide/show transitions run independently. The explicit
      // metrics are inherited by the sticky siblings for their fixed insets.
      style={
        {
          touchAction: "pan-y",
          overflowAnchor: pathname === "/" ? "none" : undefined,
          "--check-deals-header-height": `${headerHeight}px`,
          "--check-deals-chrome-height": `${chromeHeight}px`,
        } as CSSProperties
      }
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
      onTouchCancel={resetPull}
      onScroll={handleScroll}
    >
      {pathname === "/" ? (
        /* Keep Check Deals' nav and search bar in one sticky stack. Its layout
           height stays fixed while the child chrome animates on scroll. */
        <div
          ref={checkDealsChromeRef}
          className={`sticky top-0 z-[45] ${isHeaderHidden ? "check-deals-chrome-header-hidden" : ""}`}
        >
          <AppHeader sticky={false} collapseOnCheckDeals />
          <div className="check-deals-search-slot">
            <SearchBar
              variant="shadow"
              bordered
              compact
              sticky={false}
              backgroundClassName={checkDealsSearchBackground}
            />
          </div>
        </div>
      ) : (
        <AppHeader />
      )}
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
