"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { useSearch } from "@/lib/search-context";
import { useNavigationDrawer } from "@/lib/navigation-drawer-context";
import { useWatchlist } from "@/lib/watchlist-context";

export const SUBSCRIBE_BUTTON_CLASS_NAME = "pointer-events-auto flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border border-stone-500 bg-transparent px-4 py-2.5 text-center text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2";

const subscribeToMount = () => () => {};
const getClientMounted = () => true;
const getServerMounted = () => false;
const SCROLL_DIRECTION_DELTA_PX = 2;
const SCROLL_TOP_THRESHOLD_PX = 4;

/**
 * Keeps the subscription action close to its explanation, then offers the
 * same action above the bottom nav after the inline CTA has been seen and
 * scrolled out of view.
 */
export default function StickySubscriptionCta({
  label,
  description,
  onSubscribe,
}: {
  label: string;
  description: string;
  onSubscribe: () => void;
}) {
  const inlineButtonRef = useRef<HTMLButtonElement>(null);
  const stickyButtonRef = useRef<HTMLButtonElement>(null);
  const showStickyRef = useRef(false);
  const wasStickyVisibleRef = useRef(false);
  const scrollDirectionAnchorRef = useRef<number | null>(null);
  const scrollDirectionRef = useRef<"up" | "down" | null>(null);
  const [showSticky, setShowSticky] = useState(false);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const isClientMounted = useSyncExternalStore(subscribeToMount, getClientMounted, getServerMounted);
  const { isActive: isSearchActive } = useSearch();
  const { isOpen: isDrawerOpen } = useNavigationDrawer();
  const { selectedProductIds, confirmation, error } = useWatchlist();
  const isSelectionBarVisible = selectedProductIds.size > 0 || Boolean(confirmation) || Boolean(error);
  const isStickyVisible = showSticky && !isSearchActive && !isDrawerOpen && !isSelectionBarVisible;

  useEffect(() => {
    if (!isStickyVisible || document.activeElement !== inlineButtonRef.current) return;
    const frame = window.requestAnimationFrame(() => stickyButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isStickyVisible]);

  useEffect(() => {
    const wasStickyVisible = wasStickyVisibleRef.current;
    wasStickyVisibleRef.current = isStickyVisible;
    if (
      wasStickyVisible &&
      !isStickyVisible &&
      document.activeElement === stickyButtonRef.current &&
      !isSearchActive &&
      !isDrawerOpen &&
      !isSelectionBarVisible
    ) {
      inlineButtonRef.current?.focus();
    }
  }, [isDrawerOpen, isSearchActive, isSelectionBarVisible, isStickyVisible]);

  useEffect(() => {
    const inlineButton = inlineButtonRef.current;
    if (!inlineButton) return;
    const scrollRoot = inlineButton.closest<HTMLElement>(".mobile-scroll-surface");
    let frame: number | null = null;

    const setStickyVisibility = (nextVisible: boolean) => {
      if (showStickyRef.current === nextVisible) return;
      showStickyRef.current = nextVisible;
      setShowSticky(nextVisible);
    };

    const updateStickyVisibility = () => {
      frame = null;
      const scrollTop = scrollRoot?.scrollTop ?? window.scrollY;
      const directionAnchor = scrollDirectionAnchorRef.current;
      if (directionAnchor === null) {
        scrollDirectionAnchorRef.current = scrollTop;
      } else {
        const scrollDelta = scrollTop - directionAnchor;
        if (scrollDelta >= SCROLL_DIRECTION_DELTA_PX) scrollDirectionRef.current = "down";
        if (scrollDelta >= SCROLL_DIRECTION_DELTA_PX || scrollDelta <= -SCROLL_DIRECTION_DELTA_PX) {
          scrollDirectionAnchorRef.current = scrollTop;
        }
        if (scrollDelta <= -SCROLL_DIRECTION_DELTA_PX) scrollDirectionRef.current = "up";
      }

      // Never leave the floating CTA visible at the top of the Watchlist,
      // including during iOS rubber-band movement around scrollTop 0.
      if (scrollTop <= SCROLL_TOP_THRESHOLD_PX) {
        scrollDirectionAnchorRef.current = scrollTop;
        scrollDirectionRef.current = null;
        setStickyVisibility(false);
        return;
      }

      const buttonRect = inlineButton.getBoundingClientRect();
      const rootRect = scrollRoot?.getBoundingClientRect();
      const visibleTop = rootRect?.top ?? 0;
      const visibleBottom = rootRect?.bottom ?? window.innerHeight;
      const isVisible = buttonRect.bottom > visibleTop && buttonRect.top < visibleBottom;

      if (isVisible) {
        setStickyVisibility(false);
        return;
      }

      // Show the floating CTA only after the inline CTA has moved above the
      // viewport during a downward scroll. This prevents it reappearing while
      // the user is moving back up through the content or sitting near the top.
      const isPastInlineCta = buttonRect.bottom <= visibleTop;
      setStickyVisibility(isPastInlineCta && scrollDirectionRef.current === "down");
    };

    const scheduleStickyVisibilityUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateStickyVisibility);
    };

    scheduleStickyVisibilityUpdate();
    scrollRoot?.addEventListener("scroll", scheduleStickyVisibilityUpdate, { passive: true });
    window.addEventListener("resize", scheduleStickyVisibilityUpdate);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleStickyVisibilityUpdate);
    resizeObserver?.observe(inlineButton);
    if (scrollRoot) resizeObserver?.observe(scrollRoot);
    return () => {
      scrollRoot?.removeEventListener("scroll", scheduleStickyVisibilityUpdate);
      window.removeEventListener("resize", scheduleStickyVisibilityUpdate);
      resizeObserver?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const stickySubscriptionCta = (
    <motion.div
      initial={false}
      animate={isStickyVisible ? { opacity: 1, y: 0 } : prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      transition={prefersReducedMotion || isSearchActive || isDrawerOpen || isSelectionBarVisible ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
      aria-hidden={!isStickyVisible}
      inert={!isStickyVisible ? true : undefined}
      className="watchlist-selection-bar pointer-events-none fixed inset-x-0 z-[57] mx-auto w-full max-w-[480px] px-4 pr-20"
    >
      <button
        ref={stickyButtonRef}
        type="button"
        onClick={onSubscribe}
        tabIndex={isStickyVisible ? 0 : -1}
        style={{ backgroundColor: "white", pointerEvents: isStickyVisible ? "auto" : "none" }}
        className={SUBSCRIBE_BUTTON_CLASS_NAME}
      >
        {label}
      </button>
    </motion.div>
  );

  return (
    <>
      <div className="flex flex-col gap-2" inert={isStickyVisible ? true : undefined}>
        <button
          ref={inlineButtonRef}
          type="button"
          onClick={onSubscribe}
          className={SUBSCRIBE_BUTTON_CLASS_NAME}
        >
          {label}
        </button>
        <p className="text-center dd-type-secondary text-stone-500">{description}</p>
      </div>

      {isClientMounted ? createPortal(stickySubscriptionCta, document.body) : null}
    </>
  );
}
