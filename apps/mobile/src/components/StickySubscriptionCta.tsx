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
  const hasSeenInlineRef = useRef(false);
  const showStickyRef = useRef(false);
  const wasStickyVisibleRef = useRef(false);
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
      const buttonRect = inlineButton.getBoundingClientRect();
      const rootRect = scrollRoot?.getBoundingClientRect();
      const visibleTop = rootRect?.top ?? 0;
      const visibleBottom = rootRect?.bottom ?? window.innerHeight;
      const isVisible = buttonRect.bottom > visibleTop && buttonRect.top < visibleBottom;

      if (isVisible) {
        hasSeenInlineRef.current = true;
        setStickyVisibility(false);
        return;
      }

      // If a route restores a scroll position past the inline CTA, treat it
      // as already seen so the free-account action is still reachable.
      const isPastInlineCta = buttonRect.bottom <= visibleTop;
      if (hasSeenInlineRef.current || isPastInlineCta) {
        hasSeenInlineRef.current = true;
        setStickyVisibility(true);
      }
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
        style={{ pointerEvents: isStickyVisible ? "auto" : "none" }}
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
