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
    if (!inlineButton || typeof IntersectionObserver === "undefined") return;
    const scrollRoot = inlineButton.closest<HTMLElement>(".mobile-scroll-surface");

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      const isComfortablyVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      if (isComfortablyVisible) {
        hasSeenInlineRef.current = true;
        setShowSticky(false);
      } else if (hasSeenInlineRef.current) {
        setShowSticky(true);
      }
    }, { root: scrollRoot, threshold: [0, 0.5] });

    observer.observe(inlineButton);
    return () => observer.disconnect();
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
