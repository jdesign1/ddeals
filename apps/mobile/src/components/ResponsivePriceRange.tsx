"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const MAX_FONT_SIZE_PX = 22;
const MIN_FONT_SIZE_PX = 12;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Displays a cross-supermarket price range at the largest size that fits the
 * width the card has actually allocated to it. This is measured from the
 * rendered text, so it accounts for both the card layout and the number of
 * digits in the prices instead of estimating from the viewport alone.
 */
export default function ResponsivePriceRange({ text }: { text: string }) {
  const textRef = useRef<HTMLSpanElement>(null);

  useIsomorphicLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;

    const fitText = () => {
      // Measure at the maximum size first. scrollWidth remains the natural,
      // unwrapped text width even when the span is constrained by the card.
      node.style.fontSize = `${MAX_FONT_SIZE_PX}px`;
      const availableWidth = node.clientWidth;
      const naturalWidth = node.scrollWidth;
      if (!availableWidth || !naturalWidth) return;

      const fittedSize = Math.min(MAX_FONT_SIZE_PX, (MAX_FONT_SIZE_PX * availableWidth) / naturalWidth);
      node.style.fontSize = `${Math.max(MIN_FONT_SIZE_PX, fittedSize)}px`;
    };

    fitText();
    const parent = node.parentElement;
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(fitText) : null;
    resizeObserver?.observe(parent ?? node);

    // Refit once the app font has finished loading, as font metrics can alter
    // the natural width after the first layout pass.
    document.fonts?.ready.then(fitText).catch(() => {});

    return () => resizeObserver?.disconnect();
  }, [text]);

  return (
    <span
      ref={textRef}
      className="product-price-range mt-1 font-display font-extrabold text-stone-900"
    >
      {text}
    </span>
  );
}
