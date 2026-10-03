"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const SHOW_AFTER_PX = 480;
const HIDE_BEFORE_PX = 48;
const MIN_SCROLLABLE_DISTANCE_PX = 720;
const SCROLL_TO_TOP_DURATION_MS = 220;

/**
 * Small shared control for the long result lists. It waits until the list is
 * genuinely long and the user is well into it before appearing, so a short
 * page or a tiny accidental scroll does not add extra floating chrome.
 */
export default function BackToTopButton({
  scrollRef,
  enabled = true,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const scrollAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const setButtonVisible = (nextVisible: boolean) => {
      if (visibleRef.current === nextVisible) return;
      visibleRef.current = nextVisible;
      setVisible(nextVisible);
    };

    const update = () => {
      const element = scrollRef.current;
      if (!element) {
        setButtonVisible(false);
        return;
      }
      const isLongList = element.scrollHeight - element.clientHeight >= MIN_SCROLLABLE_DISTANCE_PX;
      if (!isLongList) {
        setButtonVisible(false);
        return;
      }

      // Use hysteresis so layout changes or iOS rubber-banding cannot make
      // the control flash off while the user is still scrolling back up.
      if (!visibleRef.current && element.scrollTop >= SHOW_AFTER_PX) setButtonVisible(true);
      if (visibleRef.current && element.scrollTop <= HIDE_BEFORE_PX) setButtonVisible(false);
    };

    update();
    const element = scrollRef.current;
    element?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = element ? new ResizeObserver(update) : null;
    if (observer && element) {
      observer.observe(element);
      if (element.firstElementChild) observer.observe(element.firstElementChild);
    }
    const mutationObserver = element ? new MutationObserver(update) : null;
    if (mutationObserver && element) mutationObserver.observe(element, { childList: true, subtree: true });

    return () => {
      element?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
      mutationObserver?.disconnect();
      if (scrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      }
    };
  }, [enabled, scrollRef]);

  const scrollToTop = () => {
    const element = scrollRef.current;
    if (!element) return;
    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
    }

    const startTop = element.scrollTop;
    const startTime = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / SCROLL_TO_TOP_DURATION_MS);
      const easedProgress = 1 - (1 - progress) ** 3;
      element.scrollTop = startTop * (1 - easedProgress);
      if (progress < 1) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        scrollAnimationFrameRef.current = null;
      }
    };
    scrollAnimationFrameRef.current = window.requestAnimationFrame(animate);
  };

  return (
    <AnimatePresence>
      {enabled && visible && (
        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={scrollToTop}
          aria-label="Back to top"
          className="pointer-events-auto fixed inset-x-0 bottom-safe-fab z-[45] mx-auto flex w-full max-w-[480px] justify-end px-5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg transition-colors hover:bg-ink-600">
            <ChevronUp className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
