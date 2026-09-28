"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

export interface OnboardingTourProps {
  onClose: () => void;
}

type TourStep = {
  href: string;
  target: string;
  title: string;
  body: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    href: "/",
    target: "#search-input",
    title: "Find a product",
    body: "Search for a grocery item to see current specials and compare prices across supermarkets.",
  },
  {
    href: "/",
    target: '[data-onboarding="deal-card"]',
    title: "Check the deal",
    body: "Tap a product card to see whether a special is a Dodgy Deal, Fair Deal, or Real Saver based on its price history.",
  },
  {
    href: "/",
    target: '[data-onboarding="save-product"]',
    title: "Save something useful",
    body: "Use the plus button on a product to save it to your Watchlist and keep an eye on the items you buy regularly.",
  },
  {
    href: "/lists",
    target: '[data-onboarding="watchlist-tab"]',
    title: "Your Watchlist",
    body: "Your saved products live here, ready to check when you are planning your next shop.",
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
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (pathname !== step.href) router.push(step.href);
  }, [pathname, router, step.href]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (pathname !== step.href) return;

    let cancelled = false;
    let attempts = 0;
    let retryTimer = 0;
    const measure = () => {
      if (cancelled) return;
      const nextRect = getTargetRect(step.target);
      if (nextRect && nextRect.height > 0) {
        setTargetRect(nextRect);
      }
      attempts += 1;
      if ((nextRect && nextRect.height > 0) || attempts >= 30) window.clearInterval(retryTimer);
    };

    retryTimer = window.setInterval(measure, 80);
    const initialTimer = window.setTimeout(() => {
      setTargetRect(null);
      measure();
    }, 40);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
      window.clearTimeout(initialTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [pathname, step.href, step.target, stepIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && stepIndex > 0) setStepIndex((index) => index - 1);
      if (event.key === "ArrowRight") {
        if (isLastStep) onClose();
        else setStepIndex((index) => index + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLastStep, onClose, stepIndex]);

  const spotlightStyle = useMemo(() => {
    if (!targetRect || targetRect.width === 0 || targetRect.height === 0) {
      return { display: "none" as const };
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
    const targetTop = targetRect?.top ?? viewportHeight * 0.4;
    const targetBottom = targetRect?.bottom ?? targetTop;
    const top = targetTop > viewportHeight * 0.58 ? 24 : Math.min(viewportHeight - 284, targetBottom + 24);
    return { top: Math.max(16, top) };
  }, [targetRect]);

  const goNext = () => {
    if (isLastStep) onClose();
    else setStepIndex((index) => index + 1);
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Dodgy Deal app tour">
      <div className="absolute inset-0 pointer-events-auto" aria-hidden="true" />
      <div
        className="pointer-events-none absolute border-2 border-white"
        style={{ ...spotlightStyle, boxShadow: "0 0 0 9999px rgba(28, 25, 23, 0.62)" }}
        aria-hidden="true"
      />

      <section
        className="absolute left-4 right-4 mx-auto max-w-[448px] rounded-3xl bg-white p-5 shadow-2xl"
        style={cardStyle}
        aria-live="polite"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <span className="dd-type-meta dd-type-meta-strong text-stone-500">
            {stepIndex + 1} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
            aria-label="Skip app tour"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mb-5 space-y-2">
          <h2 className="font-display text-xl font-extrabold text-ink-900">{step.title}</h2>
          <p className="dd-type-body text-stone-600">{step.body}</p>
        </div>
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
      </section>
    </div>
  );
}
