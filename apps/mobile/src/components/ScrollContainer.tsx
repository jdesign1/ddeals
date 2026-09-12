"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from "react";
import AppHeader from "@/components/AppHeader";
import BackToTopButton from "@/components/BackToTopButton";
import SearchBar from "@/components/SearchBar";
import { useSearch } from "@/lib/search-context";
import {
  isNearScrollBottom,
  getCapturedSettingsScrollPosition,
  publishCheckDealsHeaderVisibility,
  publishCheckDealsScrollPosition,
} from "@/lib/scroll-events";

const PULL_TRIGGER_PX = 72;
const PULL_MAX_PX = 112;
const PULL_DIRECTION_LOCK_PX = 8;
const HEADER_SHOW_AT_TOP = 8;
const HEADER_SCROLL_DELTA = 4;
const HEADER_TRANSITION_MS = 480;
const CONTACT_ROUTES = ["/support", "/report-deal"];

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
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTopRef = useRef(0);
  const checkDealsScrollTopRef = useRef(0);
  const settingsScrollTopRef = useRef(0);
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
  const refreshStatus: "refreshing" | "updated" | "up-to-date" | null = refreshing
    ? "refreshing"
    : feedback === "updated"
      ? "updated"
      : feedback === "throttled"
        ? "up-to-date"
        : null;

  // The outer scroll surface stays mounted while App Router swaps page
  // content. Keep the page-specific positions that should survive that swap
  // separate: Check Deals restores its list position, while Settings restores
  // its position after returning from a contact page. Contact pages always
  // start at the top so their form cannot inherit the previous page's offset.
  useLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    const isContactRoute = CONTACT_ROUTES.includes(pathname);
    const wasContactRoute = CONTACT_ROUTES.includes(previousPathname);

    if (isContactRoute) {
      if (previousPathname === "/settings") {
        settingsScrollTopRef.current = getCapturedSettingsScrollPosition();
      }

      const resetToTop = () => {
        const element = scrollRef.current;
        if (!element) return;
        element.scrollTop = 0;
        lastScrollTopRef.current = 0;
      };

      resetToTop();
      const firstFrame = window.requestAnimationFrame(() => {
        resetToTop();
      });
      return () => window.cancelAnimationFrame(firstFrame);
    }

    if (pathname === "/settings" && wasContactRoute) {
      const restoreSettingsPosition = () => {
        const element = scrollRef.current;
        if (!element) return;
        const top = Math.min(settingsScrollTopRef.current, Math.max(0, element.scrollHeight - element.clientHeight));
        element.scrollTop = top;
        lastScrollTopRef.current = top;
      };

      restoreSettingsPosition();
      let secondFrame: number | null = null;
      const firstFrame = window.requestAnimationFrame(() => {
        restoreSettingsPosition();
        secondFrame = window.requestAnimationFrame(restoreSettingsPosition);
      });

      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      };
    }

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

    // Do not interpret iOS's bottom rubber-band events as a new scroll
    // direction. Without this, the alternating scrollTop values emitted at
    // the bottom can repeatedly hide/show the sticky header while the list
    // is stationary from the user's point of view.
    if (scrollRef.current && isNearScrollBottom(scrollRef.current, currentScrollTop)) {
      headerScrollAnchorRef.current = currentScrollTop;
      return;
    }

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
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (refreshing || feedback || (scrollRef.current?.scrollTop ?? 0) > 0) return;
    const touch = event.touches[0];
    touchStartXRef.current = touch?.clientX ?? null;
    touchStartYRef.current = touch?.clientY ?? null;
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null || refreshing) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartXRef.current;
    const currentY = touch.clientY;
    const distance = currentY - touchStartYRef.current;
    // A pull-to-refresh gesture must be vertically dominant. iOS adds small
    // cross-axis movement to every finger gesture, so checking only `deltaY`
    // lets a left/right swipe with enough downward drift refresh the catalogue.
    // Once horizontal movement wins, cancel this pull for the rest of the
    // gesture instead of letting a later diagonal wobble re-arm it.
    const hasDirectionLock = Math.max(Math.abs(deltaX), Math.abs(distance)) >= PULL_DIRECTION_LOCK_PX;
    if ((hasDirectionLock && Math.abs(deltaX) >= Math.abs(distance)) || distance <= 0 || (scrollRef.current?.scrollTop ?? 0) > 0) {
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
    // Pull-to-refresh can begin after the Check Deals header has been hidden
    // by scrolling. Bring it back before the refresh status takes over the
    // nav so the full-width status surface is always visible.
    if (pathname === "/") publishCheckDealsHeaderVisibility(false);
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
          <AppHeader sticky={false} collapseOnCheckDeals refreshStatus={refreshStatus} />
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
        <AppHeader refreshStatus={refreshStatus} />
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
