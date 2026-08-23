"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";

/**
 * Generic horizontal, swipeable slide carousel with dot page indicators.
 * Originally built for the deal-assessment page's "Price History Insights"
 * section (spec step 4) -- that section stopped using it 2026-08-20 (moved
 * to always-visible stacked blocks instead of swipeable slides), and it sat
 * unused for a day, flagged rather than deleted "in case another screen
 * wants a swipeable card row later". That screen turned up the next day:
 * 2026-08-21, the same page's "Cheaper alternatives" section switched from
 * a bottom-sheet overlay to an inline expand/collapse carousel, per Jay's
 * ask -- see that section's own comment in
 * `apps/mobile/src/app/deal/[id]/[store]/page.tsx`. Kept generic/
 * content-agnostic (takes arbitrary `children` as slides) rather than baked
 * to either specific call site, which is exactly what let it be reused
 * here with zero changes to this file.
 *
 * Plain CSS scroll-snap + a scroll listener for the active-dot index --
 * no new dependency (matches this app's own established preference, see
 * StoreCompareChart.tsx's header comment on not pulling in `recharts` for
 * one small chart). `hide-scrollbar` is the same utility class
 * FullScreenSearch.tsx's own pill carousel already uses (globals.css),
 * reused here rather than duplicated.
 *
 * Each slide defaults to `w-full flex-shrink-0 snap-center` (one slide
 * fills the viewport, matching the original Price History Insights use
 * case). Pass `slideWidthClassName` for a narrower width instead (2026-08-21,
 * per Jay's "cheaper alternatives" ask below) to get a "peek" carousel where
 * the next/previous slide's edge is visibly cut off at the container edge --
 * a swipe affordance so it reads as a carousel rather than a single static
 * card. The caller is still responsible for giving every slide a consistent
 * height so swiping doesn't jump the page height around -- either a fixed
 * height per slide (the original Price History Insights use case:
 * StoreCompareChart/PriceHistoryInsightCard both used `h-56`; the
 * cheaper-alternatives cards now do the same with `h-64` + `line-clamp-2`
 * on the product name to bound worst-case content -- 2026-08-21, per Jay's
 * "always the same height" ask, superseding the variable-height read this
 * comment used to describe here), or, for content that's still genuinely
 * variable-height, by wrapping this component in its own `height: "auto"`-
 * animated container that re-measures on every swipe.
 */
export default function InsightCarousel({
  children,
  slideWidthClassName = "w-full",
  trackPaddingClassName = "",
}: {
  children: React.ReactNode;
  /** Tailwind width class for each slide. Defaults to `w-full` (one slide
   * per view). Pass a narrower value (e.g. `w-[88%]`) for a "peek" carousel
   * -- see this file's own header comment. */
  slideWidthClassName?: string;
  /** Tailwind padding classes (e.g. `px-5`) applied to the scroll TRACK
   * itself, not a wrapping element (2026-08-21, per Jay: "ensure the hint
   * extends to the border of the container, so there's no gap" on the
   * "peek" carousel case). Putting the inset here rather than on an outer
   * div means the padding scrolls WITH the content -- slide 1 still starts
   * with some breathing room instead of sitting flush at the very edge,
   * but a peeking slide mid-scroll can still reach the viewport's TRUE
   * edge with no fixed gap in between, since that padding is only ever
   * visible at the very start/end of the whole scrollable range, not on
   * every frame of the scroll. Only does anything useful if the caller ALSO
   * removes any padding this component would otherwise inherit from its
   * own parent (e.g. `-mx-5` to cancel a card's `p-5`) -- passing this prop
   * alone, with the outer wrapper still inset, just moves the same gap
   * from one place to another rather than removing it. Defaults to `""`
   * (no change) so the original Price History Insights use case, which
   * never had this gap issue (its slides are `w-full`, no peek to reach
   * an edge with), is unaffected. */
  trackPaddingClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const slides = Children.toArray(children);
  const slideCount = slides.length;

  // Distance (px) between the start of one slide and the start of the next
  // -- slide width + the track's own `gap-3`. NOT the same as `clientWidth`
  // once `slideWidthClassName` narrows slides below 100% (the "peek"
  // carousel case, 2026-08-21): scrollLeft/clientWidth math below would
  // then round to the wrong slide index, since a full `clientWidth` no
  // longer equals one slide-step. Measured via the DOM (offsetLeft delta
  // between slide 0 and slide 1) instead of computed from the className
  // string, so it stays correct regardless of what width/gap values the
  // caller passes -- falls back to the single slide's own width when
  // there's only one (no second slide to diff against), which also happens
  // to match the old `clientWidth`-based math exactly in the default
  // `w-full`, no-peek case.
  const getSlideStep = useCallback((el: HTMLDivElement) => {
    const first = el.children[0] as HTMLElement | undefined;
    const second = el.children[1] as HTMLElement | undefined;
    if (first && second) return second.offsetLeft - first.offsetLeft;
    return first?.offsetWidth ?? el.clientWidth;
  }, []);

  // Rounds scrollLeft/step to the nearest whole slide -- robust to
  // sub-pixel scroll positions mid-swipe/momentum, snaps the dot indicator
  // to whichever slide is actually centered rather than flickering between
  // two indices while the user's finger is still moving.
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || el.clientWidth === 0) return;
    const step = getSlideStep(el);
    if (!step) return;
    const idx = Math.round(el.scrollLeft / step);
    setActiveIndex(Math.max(0, Math.min(slideCount - 1, idx)));
  }, [slideCount, getSlideStep]);

  // Peer-review fix (2026-08-19): `scrollLeft` (absolute pixels) doesn't
  // re-fire `onScroll` by itself when the viewport resizes (orientation
  // change, browser zoom, mobile virtual-keyboard-induced resize) --
  // without this, the active dot / `aria-hidden` flags can silently point
  // at the wrong slide relative to what's actually visible until the user's
  // next swipe. Recomputes the same way handleScroll does, keyed off the
  // container's own width changing.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(handleScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleScroll]);

  // Peer-review fix (2026-08-19): if this component instance persists
  // across a slide-set change (e.g. `deal`/`insights` changing without a
  // full page remount) rather than being torn down, `activeIndex` would
  // otherwise keep pointing at a now-out-of-range or stale index while the
  // scroll container itself resets to slide 0 -- dots/aria-hidden would
  // then describe content that isn't what's on screen. Snap back to slide 0
  // (matching the container's own natural scroll-reset) whenever the
  // number of slides changes.
  //
  // Fixed 2026-08-21 (this component going back into active use surfaced a
  // pre-existing `react-hooks/set-state-in-effect` lint error here, dormant
  // but not actually fixed while this file sat unused): `setActiveIndex(0)`
  // used to live inside the effect below, right after the DOM `scrollTo`
  // call. React's own docs flag setState-inside-an-effect as a smell for
  // exactly this shape ("adjusting state when a prop changes") and
  // recommend comparing against a ref of the last-seen value and setting
  // state directly during render instead -- that's what `prevSlideCount`
  // below does. The DOM `scrollTo` call is genuine imperative browser work
  // and correctly stays in a `useEffect`; only the `setActiveIndex` moved.
  // Behavior is unchanged -- still resets to slide 0 exactly when
  // `slideCount` changes, just via React's sanctioned render-time pattern
  // instead of a same-effect setState call.
  const [prevSlideCount, setPrevSlideCount] = useState(slideCount);
  if (slideCount !== prevSlideCount) {
    setPrevSlideCount(slideCount);
    setActiveIndex(0);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTo({ left: 0, behavior: "auto" });
  }, [slideCount]);

  return (
    <div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth ${trackPaddingClassName}`}
        role="group"
        aria-roledescription="carousel"
      >
        {slides.map((slide, i) => (
          <div key={i} className={`${slideWidthClassName} flex-shrink-0 snap-center`} aria-hidden={i !== activeIndex}>
            {slide}
          </div>
        ))}
      </div>

      {/* Dots hidden entirely for a single slide (e.g. no real 90-day
          history yet, so buildPriceHistoryInsights() returned [] and only
          the chart slide remains) -- a one-dot indicator would just be
          visual noise with nothing to switch between. */}
      {slideCount > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5" role="tablist" aria-label="Carousel slides">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Slide ${i + 1} of ${slideCount}`}
              onClick={() => {
                const el = containerRef.current;
                if (!el) return;
                el.scrollTo({ left: i * getSlideStep(el), behavior: "smooth" });
              }}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIndex ? "w-4 bg-ink-600" : "w-1.5 bg-stone-300"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
