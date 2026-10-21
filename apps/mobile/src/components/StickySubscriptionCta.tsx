"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSearch } from "@/lib/search-context";
import { useWatchlist } from "@/lib/watchlist-context";

export const SUBSCRIBE_BUTTON_CLASS_NAME = "pointer-events-auto flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border border-stone-500 bg-transparent px-4 py-2.5 text-center text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2";

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
  const [showSticky, setShowSticky] = useState(false);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const { isActive: isSearchActive } = useSearch();
  const { selectedProductIds, confirmation, error } = useWatchlist();
  const isSelectionBarVisible = selectedProductIds.size > 0 || Boolean(confirmation) || Boolean(error);
  const isStickyVisible = showSticky && !isSearchActive && !isSelectionBarVisible;

  useEffect(() => {
    if (!isStickyVisible || document.activeElement !== inlineButtonRef.current) return;
    const frame = window.requestAnimationFrame(() => stickyButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isStickyVisible]);

  useEffect(() => {
    const inlineButton = inlineButtonRef.current;
    if (!inlineButton) return;
    const scrollRoot = inlineButton.closest<HTMLElement>(".mobile-scroll-surface");
    let frame: number | null = null;

    const updateStickyVisibility = () => {
      frame = null;
      const buttonRect = inlineButton.getBoundingClientRect();
      const rootRect = scrollRoot?.getBoundingClientRect();
      const visibleTop = rootRect?.top ?? 0;
      const visibleBottom = rootRect?.bottom ?? window.innerHeight;
      const isVisible = buttonRect.bottom > visibleTop && buttonRect.top < visibleBottom;

      if (isVisible) {
        hasSeenInlineRef.current = true;
        setShowSticky(false);
        return;
      }

      // If a route restores a scroll position past the inline CTA, treat it
      // as already seen so the free-account action is still reachable.
      const isPastInlineCta = buttonRect.bottom <= visibleTop;
      if (hasSeenInlineRef.current || isPastInlineCta) {
        hasSeenInlineRef.current = true;
        setShowSticky(true);
      }
    };

    const scheduleStickyVisibilityUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateStickyVisibility);
    };

    scheduleStickyVisibilityUpdate();
    scrollRoot?.addEventListener("scroll", scheduleStickyVisibilityUpdate, { passive: true });
    window.addEventListener("resize", scheduleStickyVisibilityUpdate);
    return () => {
      scrollRoot?.removeEventListener("scroll", scheduleStickyVisibilityUpdate);
      window.removeEventListener("resize", scheduleStickyVisibilityUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

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

      <AnimatePresence initial={false}>
        {isStickyVisible && (
          <motion.div
            key="sticky-subscription-cta"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
            className="watchlist-selection-bar pointer-events-none fixed inset-x-0 z-[57] mx-auto w-full max-w-[480px] px-4 pr-20"
          >
            <button ref={stickyButtonRef} type="button" onClick={onSubscribe} className={SUBSCRIBE_BUTTON_CLASS_NAME}>
              {label}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
