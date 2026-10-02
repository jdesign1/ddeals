"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import MascotImage from "@/components/MascotImage";

export interface OnboardingTourProps {
  onClose: () => void;
}

type TourStep = {
  href: string;
  target: string;
  title: string;
  body: string;
  position?: "top" | "bottom" | "middle" | "lower";
  welcome?: boolean;
  scrim?: "below-card";
};

const DEAL_ROUTE = "__deal__";

const TOUR_STEPS: TourStep[] = [
  {
    href: "/",
    target: "",
    title: "Welcome to Dodgy Deal",
    body: "Prices change so often it's hard to keep up! Dodgy Deal finds the best and worst deals for you from NZ supermarkets. We use pricing history to determine which specials are legitimate savers, and which to stay away from.",
    welcome: true,
  },
  {
    href: "/",
    target: '[data-onboarding="search-button"]',
    title: "Find a product",
    body: "Search for grocery items to see current specials and compare across supermarkets.",
  },
  {
    href: "/",
    target: '[data-onboarding="top-savings-deal-card"], [data-onboarding="dodgy-deal-card"]',
    title: "Check a deal",
    body: "Tap an item to see whether the special is Dodgy, Fair, or a Real Saver based on price history.",
    position: "top",
  },
  {
    href: DEAL_ROUTE,
    target: "",
    title: "Deal assessment",
    body: "This page brings together the current price, product details, and supermarket comparison so you can see the full picture.",
    position: "lower",
    scrim: "below-card",
  },
  {
    href: DEAL_ROUTE,
    target: '[data-onboarding="deal-verdict"]',
    title: "Read the verdict",
    body: "The verdict tells you whether the special is Dodgy, Fair, or a Real Saver. Scroll down for the evidence and price history behind it.",
    position: "middle",
  },
  {
    href: DEAL_ROUTE,
    target: '[data-onboarding="deal-save"]',
    title: "Save something useful",
    body: "Use the plus button to save this product to your Watchlist. You can then keep an eye out for a better price.",
    position: "middle",
  },
  {
    href: "/lists",
    target: '[data-onboarding="watchlist-tab"]',
    title: "Your Watchlist",
    body: "Your saved products live here, ready to check for your next shop. We'll notify you when these items go on special for a better price.",
  },
];

export default function OnboardingTour({ onClose }: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [dealHref, setDealHref] = useState<string | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetStepIndex, setTargetStepIndex] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const didAutoScrollRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const stepTransitionTimerRef = useRef<number | null>(null);
  const isStepTransitioningRef = useRef(false);
  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  const activeHref = step.href === DEAL_ROUTE ? dealHref : step.href;
  const isDealPath = pathname.startsWith("/deal/");

  useEffect(() => {
    if (step.href === DEAL_ROUTE) {
      if (dealHref && !isDealPath) router.push(dealHref);
      return;
    }
    if (pathname !== step.href) router.push(step.href);
  }, [dealHref, isDealPath, pathname, router, step.href]);

  // Resolve the first deal while the tour is still on Check Deals. This keeps
  // steps 4–6 deterministic: the route is already known before the user taps
  // Next, rather than depending on a second query during the transition.
  useEffect(() => {
    if (pathname !== "/" || dealHref) return;

    let attempts = 0;
    let retryTimer = 0;
    const findDeal = () => {
      const card = document.querySelector<HTMLElement>('[data-onboarding="top-savings-deal-card"], [data-onboarding="dodgy-deal-card"]');
      const href = card?.dataset.onboardingDealHref;
      if (href) {
        setDealHref(href);
        window.clearInterval(retryTimer);
        return;
      }
      attempts += 1;
      if (attempts >= 80) window.clearInterval(retryTimer);
    };
    retryTimer = window.setInterval(findDeal, 80);
    findDeal();
    return () => window.clearInterval(retryTimer);
  }, [dealHref, pathname]);

  useEffect(() => {
    if (dealHref) router.prefetch(dealHref);
  }, [dealHref, router]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      if (stepTransitionTimerRef.current) window.clearTimeout(stepTransitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let retryTimer = 0;
    let settleTimer = 0;
    let isAutoScrolling = false;
    didAutoScrollRef.current = false;

    const routeReady = step.href === DEAL_ROUTE ? isDealPath : pathname === activeHref;
    if (!step.target || !activeHref || !routeReady) {
      return;
    }

    const measure = () => {
      if (cancelled || isAutoScrolling) return;
      const target = document.querySelector<HTMLElement>(step.target);
      const nextRect = target?.getBoundingClientRect() ?? null;
      attempts += 1;
      if ((nextRect && nextRect.width > 0 && nextRect.height > 0) || attempts >= 80) window.clearInterval(retryTimer);

      const hasLayout = Boolean(nextRect && nextRect.width > 0 && nextRect.height > 0);
      const shouldAutoScroll = hasLayout && stepIndex === 2;

      if (target && shouldAutoScroll && !didAutoScrollRef.current) {
        didAutoScrollRef.current = true;
        isAutoScrolling = true;
        // Keep the card comfortably below the explanatory card at the top,
        // while reserving a little space above the iOS safe-area controls.
        target.scrollIntoView({ block: "end", behavior: prefersReducedMotion ? "auto" : "smooth" });
        settleTimer = window.setTimeout(() => {
          isAutoScrolling = false;
          measure();
        }, prefersReducedMotion ? 40 : 420);
        return;
      }
      if (nextRect && nextRect.width > 0 && nextRect.height > 0) {
        setTargetRect((currentRect) => {
          if (
            currentRect &&
            currentRect.top === nextRect.top &&
            currentRect.left === nextRect.left &&
            currentRect.width === nextRect.width &&
            currentRect.height === nextRect.height
          ) {
            return currentRect;
          }
          return nextRect;
        });
        setTargetStepIndex((currentStepIndex) => currentStepIndex === stepIndex ? currentStepIndex : stepIndex);
      }
    };

    retryTimer = window.setInterval(measure, 80);
    const initialTimer = window.setTimeout(measure, 40);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(initialTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [activeHref, isDealPath, pathname, prefersReducedMotion, step.href, step.target, stepIndex]);

  const hasTarget = Boolean(
    step.target &&
    targetStepIndex === stepIndex &&
    targetRect &&
    targetRect.width > 0 &&
    targetRect.height > 0,
  );
  const spotlightStyle = useMemo(() => {
    if (!targetRect || targetRect.width === 0 || targetRect.height === 0) {
      return { top: -100, left: -100, width: 0, height: 0, borderRadius: 18 };
    }
    const viewportWidth = typeof window === "undefined" ? 480 : window.innerWidth;
    const cardWidth = Math.min(448, viewportWidth - 32);
    const cardLeft = Math.max(16, (viewportWidth - cardWidth) / 2);
    const verdictCardLeftOffset = stepIndex === 4 ? 12 : 0;
    return {
      top: Math.max(8, targetRect.top - 8),
      left: stepIndex === 1 ? cardLeft : Math.max(8, targetRect.left - 8 - verdictCardLeftOffset),
      width: stepIndex === 1 ? cardWidth : targetRect.width + 16 + verdictCardLeftOffset,
      height: targetRect.height + 16,
      borderRadius: 18,
    };
  }, [stepIndex, targetRect]);

  const cardStyle = useMemo(() => {
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
    if (step.welcome) return { top: "54%", transform: "translateY(-50%)" };
    if (step.position === "top") return { top: 16 };
    if (step.position === "middle") {
      return { top: Math.max(96, Math.min(viewportHeight - 276, viewportHeight * 0.56)) };
    }
    if (step.position === "lower") {
      return { top: Math.max(112, Math.min(viewportHeight - 250, viewportHeight * 0.62)) };
    }

    const targetTop = targetRect?.top ?? viewportHeight * 0.4;
    const targetBottom = targetRect?.bottom ?? targetTop;
    const top = targetTop > viewportHeight * 0.58 ? 24 : Math.min(viewportHeight - 284, targetBottom + 24);
    return { top: Math.max(16, top) };
  }, [step.position, step.welcome, targetRect]);

  const closeTour = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, prefersReducedMotion ? 80 : 280);
  }, [isClosing, onClose, prefersReducedMotion]);

  const finishTour = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      if (pathname !== "/") router.push("/");
      onClose();
    }, prefersReducedMotion ? 80 : 280);
  }, [isClosing, onClose, pathname, prefersReducedMotion, router]);

  const changeStep = useCallback((nextStep: number) => {
    if (isClosing || isStepTransitioningRef.current) return;
    isStepTransitioningRef.current = true;
    setStepIndex(nextStep);
    stepTransitionTimerRef.current = window.setTimeout(() => {
      isStepTransitioningRef.current = false;
    }, prefersReducedMotion ? 100 : 500);
  }, [isClosing, prefersReducedMotion]);

  const goNext = useCallback(() => {
    if (isLastStep) {
      finishTour();
    } else {
      changeStep(stepIndex + 1);
    }
  }, [changeStep, finishTour, isLastStep, stepIndex]);

  const usesBelowCardScrim = step.scrim === "below-card";
  const showBaseScrim = usesBelowCardScrim || !hasTarget;
  const scrimOpacity = showBaseScrim ? (usesBelowCardScrim ? 1 : 0.62) : 0;
  const shouldSnapCheckDealScrim = stepIndex === 2 && !hasTarget;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTour();
      if (event.key === "ArrowLeft" && stepIndex > 0) changeStep(stepIndex - 1);
      if (event.key === "ArrowRight") {
        if (isLastStep) {
          finishTour();
        } else {
          changeStep(stepIndex + 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeStep, closeTour, finishTour, isLastStep, stepIndex]);

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Dodgy Deal app tour">
      <motion.div
        className="pointer-events-auto absolute inset-x-0 bottom-0 bg-stone-950"
        initial={false}
        animate={{ opacity: scrimOpacity }}
        transition={{ duration: shouldSnapCheckDealScrim ? 0 : prefersReducedMotion ? 0.08 : 0.16, ease: "easeOut" }}
        style={
          usesBelowCardScrim
            ? {
                top: cardStyle.top,
                background: "linear-gradient(to bottom, rgba(28, 25, 23, 0) 0%, rgba(28, 25, 23, 0.62) 46%, rgba(28, 25, 23, 0.62) 100%)",
              }
            : { top: 0 }
        }
        aria-hidden="true"
      />

      <AnimatePresence mode="wait" initial={false}>
        {hasTarget && (
          <motion.div
            key={`spotlight-${stepIndex}`}
            className="pointer-events-none absolute border-2 border-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.08 : 0.16, ease: "easeOut" }}
            style={{ ...spotlightStyle, boxShadow: "0 0 0 9999px rgba(28, 25, 23, 0.62)" }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {hasTarget && !prefersReducedMotion && (
        <motion.div
          key={`pulse-${stepIndex}`}
          className="pointer-events-none absolute border-2 border-white"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0.97, 1, 0.97],
            boxShadow: [
              "0 0 0 0 rgba(255,255,255,0)",
              "0 0 0 7px rgba(255,255,255,.42)",
              "0 0 0 0 rgba(255,255,255,0)",
            ],
          }}
          transition={{ duration: 0.55, repeat: 3, repeatType: "loop", ease: "easeInOut" }}
          style={spotlightStyle}
          aria-hidden="true"
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {!isClosing && (
        <motion.section
          key={stepIndex}
          className="absolute left-4 right-4 mx-auto max-w-[448px] rounded-3xl bg-white px-5 py-4 shadow-2xl"
          style={cardStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.08 : 0.24, ease: "easeInOut" }}
          aria-live="polite"
        >
          {step.welcome && (
            <>
              <button
                type="button"
                onClick={closeTour}
                className="absolute right-5 top-4 flex h-6 w-6 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                aria-label="Skip app tour"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="mb-0 flex justify-center">
                <MascotImage
                  src="/auth-wave.webp"
                  darkSrc="/auth-wave-dark.webp"
                  alt="Dodgy Deal mascot waving"
                  width={192}
                  height={222}
                  sizes="80px"
                  unoptimized
                  className="mascot-wave h-20 w-20 object-contain"
                />
              </div>
              <h2 className="whitespace-nowrap text-center font-display text-xl font-extrabold leading-tight text-ink-900">{step.title}</h2>
            </>
          )}
          {!step.welcome && (
            <div className="flex min-h-6 items-center justify-between gap-3">
              <h2 className="whitespace-nowrap font-display text-xl font-extrabold leading-tight text-ink-900">{step.title}</h2>
              <button
                type="button"
                onClick={closeTour}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                aria-label="Skip app tour"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          )}
          <p className="mb-3 mt-3 dd-type-body text-left text-stone-600">{step.body}</p>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={closeTour}
              className="dd-type-control text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-900"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => changeStep(stepIndex - 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 text-stone-700 transition-colors hover:bg-stone-50"
                  aria-label="Previous tour step"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={goNext} className="dd-btn dd-btn-primary min-w-28">
                {isLastStep ? "Get started" : "Next"}
                {!isLastStep && <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
