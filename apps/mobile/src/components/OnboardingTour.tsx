"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
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
  position?: "bottom";
  welcome?: boolean;
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
    target: '[data-onboarding="search-bar"]',
    title: "Find a product",
    body: "Search for grocery items to see current specials and compare across supermarkets.",
  },
  {
    href: "/",
    target: '[data-onboarding="deal-card"]',
    title: "Check a deal",
    body: "Tap an item to see whether the special is Dodgy, Fair, or a Real Saver based on price history.",
    position: "bottom",
  },
  {
    href: DEAL_ROUTE,
    target: '[data-onboarding="deal-summary"]',
    title: "Deal assessment",
    body: "This page brings together the current price, product details, and supermarket comparison so you can see the full picture.",
  },
  {
    href: DEAL_ROUTE,
    target: '[data-onboarding="deal-verdict"]',
    title: "Read the verdict",
    body: "The verdict tells you whether the special is Dodgy, Fair, or a Real Saver. Scroll down for the evidence and price history behind it.",
  },
  {
    href: DEAL_ROUTE,
    target: '[data-onboarding="deal-save"]',
    title: "Save something useful",
    body: "Use the plus button to save this product to your Watchlist. You can then keep an eye out for a better price.",
  },
  {
    href: "/lists",
    target: '[data-onboarding="watchlist-tab"]',
    title: "Your Watchlist",
    body: "Your saved products live here, ready to check for your next shop. We'll notify you when these items go on special for a better price.",
  },
  {
    href: "/history",
    target: '[data-onboarding="history-tab"]',
    title: "All your checks",
    body: "Review the products you have checked before, so you can quickly revisit a deal assessment.",
  },
  {
    href: "/me",
    target: '[data-onboarding="stats-tab"]',
    title: "Your deal stats",
    body: "See your checking activity and the kinds of deals you have been finding.",
  },
];

function getTargetRect(selector: string): DOMRect | null {
  const target = document.querySelector<HTMLElement>(selector);
  return target ? target.getBoundingClientRect() : null;
}

export default function OnboardingTour({ onClose }: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [dealHref, setDealHref] = useState<string | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  const activeHref = step.href === DEAL_ROUTE ? dealHref : step.href;

  useEffect(() => {
    if (step.href === DEAL_ROUTE) {
      if (dealHref && pathname !== dealHref) router.push(dealHref);
      return;
    }
    if (pathname !== step.href) router.push(step.href);
  }, [dealHref, pathname, router, step.href]);

  // The first product card is the bridge into the real assessment route. Read
  // its href from the rendered card instead of inventing a product ID in the tour.
  useEffect(() => {
    if (step.href !== DEAL_ROUTE || dealHref) return;

    let attempts = 0;
    let retryTimer = 0;
    const findDeal = () => {
      const card = document.querySelector<HTMLElement>('[data-onboarding="deal-card"]');
      const href = card?.dataset.onboardingDealHref;
      if (href) {
        setDealHref(href);
        router.push(href);
        window.clearInterval(retryTimer);
        return;
      }
      attempts += 1;
      if (attempts >= 40) window.clearInterval(retryTimer);
    };
    retryTimer = window.setInterval(findDeal, 80);
    findDeal();
    return () => window.clearInterval(retryTimer);
  }, [dealHref, router, step.href]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let retryTimer = 0;
    const resetTimer = window.setTimeout(() => setTargetRect(null), 0);

    if (!step.target || !activeHref || pathname !== activeHref) {
      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    const measure = () => {
      if (cancelled) return;
      const nextRect = getTargetRect(step.target);
      if (nextRect && nextRect.width > 0 && nextRect.height > 0) setTargetRect(nextRect);
      attempts += 1;
      if ((nextRect && nextRect.width > 0 && nextRect.height > 0) || attempts >= 40) window.clearInterval(retryTimer);
    };

    retryTimer = window.setInterval(measure, 80);
    const initialTimer = window.setTimeout(measure, 40);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
      window.clearTimeout(initialTimer);
      window.clearTimeout(resetTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [activeHref, pathname, step.target, stepIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && stepIndex > 0) setStepIndex((index) => index - 1);
      if (event.key === "ArrowRight") {
        if (isLastStep) {
          if (pathname !== "/") router.push("/");
          onClose();
        } else {
          setStepIndex((index) => index + 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLastStep, onClose, pathname, router, stepIndex]);

  const hasTarget = Boolean(targetRect && targetRect.width > 0 && targetRect.height > 0);
  const spotlightStyle = useMemo(() => {
    if (!targetRect || targetRect.width === 0 || targetRect.height === 0) {
      return { top: -100, left: -100, width: 0, height: 0, borderRadius: 18 };
    }
    return {
      top: Math.max(8, targetRect.top - 8),
      left: Math.max(8, targetRect.left - 8),
      width: targetRect.width + 16,
      height: targetRect.height + 16,
      borderRadius: 18,
    };
  }, [targetRect]);

  const cardStyle = useMemo(() => {
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
    if (step.welcome) return { top: "50%", transform: "translateY(-50%)" };
    if (step.position === "bottom") return { top: Math.max(16, viewportHeight - 268) };

    const targetTop = targetRect?.top ?? viewportHeight * 0.4;
    const targetBottom = targetRect?.bottom ?? targetTop;
    const top = targetTop > viewportHeight * 0.58 ? 24 : Math.min(viewportHeight - 284, targetBottom + 24);
    return { top: Math.max(16, top) };
  }, [step.position, step.welcome, targetRect]);

  const goNext = () => {
    if (isLastStep) {
      if (pathname !== "/") router.push("/");
      onClose();
    } else {
      setStepIndex((index) => index + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Dodgy Deal app tour">
      <div className={`absolute inset-0 pointer-events-auto ${hasTarget ? "" : "bg-stone-950/62"}`} aria-hidden="true" />

      <motion.div
        className="pointer-events-none absolute border-2 border-white"
        animate={spotlightStyle}
        transition={{ duration: prefersReducedMotion ? 0.12 : 0.34, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: hasTarget ? "0 0 0 9999px rgba(28, 25, 23, 0.62)" : "none" }}
        aria-hidden="true"
      />

      {hasTarget && !prefersReducedMotion && (
        <motion.div
          key={`pulse-${stepIndex}`}
          className="pointer-events-none absolute border-2 border-white"
          initial={spotlightStyle}
          animate={{
            ...spotlightStyle,
            boxShadow: ["0 0 0 0 rgba(255,255,255,0)", "0 0 0 7px rgba(255,255,255,.48)", "0 0 0 0 rgba(255,255,255,0)"],
          }}
          transition={{ duration: 0.72, repeat: 1, ease: "easeOut" }}
          aria-hidden="true"
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={stepIndex}
          className="absolute left-4 right-4 mx-auto max-w-[448px] rounded-3xl bg-white p-5 shadow-2xl"
          style={cardStyle}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: prefersReducedMotion ? 0.12 : 0.22, ease: "easeOut" }}
          aria-live="polite"
        >
          <div className="mb-4 flex items-center gap-3">
            <MascotImage
              src="/auth-wave.webp"
              darkSrc="/auth-wave-dark.webp"
              alt={step.welcome ? "Dodgy Deal mascot waving" : "Dodgy Deal mascot"}
              width={192}
              height={222}
              sizes={step.welcome ? "80px" : "40px"}
              unoptimized
              className={`mascot-wave flex-shrink-0 object-contain ${step.welcome ? "h-20 w-20" : "h-10 w-9"}`}
            />
            <div className="min-w-0 flex-1">
              <span className="dd-type-meta dd-type-meta-strong text-stone-500">
                {stepIndex + 1} of {TOUR_STEPS.length}
              </span>
              <h2 className="mt-1 font-display text-xl font-extrabold text-ink-900">{step.title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              aria-label="Skip app tour"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <p className="mb-5 dd-type-body text-stone-600">{step.body}</p>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="dd-type-control text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-900"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setStepIndex((index) => index - 1)}
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
      </AnimatePresence>
    </div>
  );
}
