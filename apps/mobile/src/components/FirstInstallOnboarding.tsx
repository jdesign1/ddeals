"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DealDetectiveQuizCase } from "@/lib/deal-detective-quiz";

type OnboardingStep = "welcome" | "case-loading" | "case" | "ready";

const DealDetectiveQuiz = dynamic(() => import("@/components/DealDetectiveQuiz"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[100dvh] w-full flex-col bg-[#faf8f4]" role="status" aria-label="Loading Deal Detective case">
      <h2 id="new-specials-title" className="sr-only">Your first Deal Detective case</h2>
      <p id="new-specials-description" className="sr-only">Loading a pair of current specials to compare.</p>
      <div className="dd-skeleton-shimmer aspect-[1.1/1] w-full shrink-0" aria-hidden="true" />
      <div className="flex flex-1 flex-col px-5 pt-4">
        <div className="mx-auto dd-skeleton-shimmer h-7 w-64 max-w-full rounded" aria-hidden="true" />
        <div className="mt-5 flex gap-3" aria-hidden="true">
          <div className="dd-skeleton-shimmer h-56 min-w-0 flex-1 rounded-2xl" />
          <div className="dd-skeleton-shimmer h-56 min-w-0 flex-1 rounded-2xl" />
        </div>
        <div className="mt-auto pb-safe-sm pt-4" aria-hidden="true">
          <div className="dd-skeleton-shimmer h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  ),
});

const noop = () => undefined;

export default function FirstInstallOnboarding({
  quizCase,
  isQuizCaseLoading,
  onComplete,
  onStartTour,
}: {
  quizCase: DealDetectiveQuizCase | null;
  isQuizCaseLoading: boolean;
  onComplete: () => void;
  onStartTour: () => void;
}) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [activeQuizCase, setActiveQuizCase] = useState<DealDetectiveQuizCase | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const visibleStep: OnboardingStep = step === "case-loading"
    ? quizCase ? "case" : isQuizCaseLoading ? "case-loading" : "ready"
    : step;
  const displayCase = activeQuizCase ?? (step === "case-loading" ? quizCase : null);
  const isWelcome = visibleStep === "welcome";
  const leftDealKey = quizCase?.left.dealKey;
  const rightDealKey = quizCase?.right.dealKey;

  useEffect(() => {
    if (!leftDealKey || !rightDealKey) return;
    // Warm the existing game code and artwork while the welcome screen is on
    // screen, so opening the first case doesn't wait on a cold chunk or image.
    void import("@/components/DealDetectiveQuiz").catch(() => undefined);
    const caseArtwork = new window.Image();
    caseArtwork.src = "/deal-detective-case-mascot-wide.webp";
  }, [leftDealKey, rightDealKey]);

  useEffect(() => {
    const heading = dialogRef.current?.querySelector<HTMLElement>("[data-onboarding-focus], h1");
    heading?.focus();
  }, [visibleStep]);

  useEffect(() => {
    const keepFocusInsideDialog = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const heading = dialog.querySelector<HTMLElement>("[data-onboarding-focus], h1");
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keepFocusInsideDialog);
    return () => document.removeEventListener("keydown", keepFocusInsideDialog);
  }, []);

  const showExample = useCallback(() => {
    if (quizCase) {
      setActiveQuizCase(quizCase);
      setStep("case");
    } else if (isQuizCaseLoading) {
      setStep("case-loading");
    } else {
      setStep("ready");
    }
  }, [isQuizCaseLoading, quizCase]);
  const continueToReady = useCallback(() => setStep("ready"), []);
  const skipCaseLoading = useCallback(() => setStep("ready"), []);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex justify-center bg-[#faf8f4] text-stone-900"
      role="dialog"
      aria-modal="true"
      aria-labelledby={visibleStep === "case" ? "new-specials-title" : visibleStep === "case-loading" ? "first-install-loading-title" : "first-install-title"}
      aria-describedby={visibleStep === "case" ? "new-specials-description" : visibleStep === "case-loading" ? undefined : "first-install-description"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {visibleStep === "case" && displayCase ? (
          <motion.div
            key="first-case"
            className="h-full max-h-[100dvh] w-full overflow-y-auto"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: "easeOut" }}
          >
            <DealDetectiveQuiz
              quizCase={displayCase}
              accessToken={null}
              streakScope="first-install"
              onBack={noop}
              onViewDeals={continueToReady}
              onDone={continueToReady}
              onAnswered={noop}
              onPlayed={noop}
              showViewDealsButton={false}
              showBackButton={false}
              onboardingMode
            />
          </motion.div>
        ) : visibleStep === "case-loading" ? (
          <motion.div
            key="case-loading"
            className="flex h-full max-h-[100dvh] w-full flex-col bg-[#faf8f4]"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            <h1 id="first-install-loading-title" className="sr-only">Preparing your first case</h1>
            <div className="dd-skeleton-shimmer aspect-[1.1/1] w-full shrink-0" aria-hidden="true" />
            <div className="flex flex-1 flex-col px-5 pt-4">
              <p className="text-center dd-type-secondary text-stone-600" role="status" aria-live="polite">
                Getting a case ready…
              </p>
              <div className="mx-auto dd-skeleton-shimmer h-7 w-64 max-w-full rounded" aria-hidden="true" />
              <div className="mt-5 flex gap-3">
                <div className="dd-skeleton-shimmer h-56 min-w-0 flex-1 rounded-2xl" aria-hidden="true" />
                <div className="dd-skeleton-shimmer h-56 min-w-0 flex-1 rounded-2xl" aria-hidden="true" />
              </div>
              <div className="mt-auto pb-safe-sm pt-4">
                <button type="button" onClick={skipCaseLoading} className="dd-btn dd-btn-outline min-h-12 w-full" aria-label="Skip the first case">
                  Skip
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={visibleStep}
            className="flex h-full max-h-[100dvh] w-full flex-col"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: "easeOut" }}
          >
            <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
              <div className="relative aspect-square w-full shrink-0 overflow-hidden">
                <Image
                  src="/first-install-welcome.webp"
                  alt={isWelcome ? "The Dodgy Deal mascot thoughtfully comparing specials in a supermarket aisle" : ""}
                  aria-hidden={!isWelcome}
                  fill
                  sizes="100vw"
                  preload
                  className={`object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none ${isWelcome ? "opacity-100" : "opacity-0"}`}
                />
                <Image
                  src="/first-install-inspect.webp"
                  alt={!isWelcome ? "The Dodgy Deal mascot inspecting a supermarket special with a magnifying glass" : ""}
                  aria-hidden={isWelcome}
                  fill
                  sizes="100vw"
                  preload
                  className={`object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none ${!isWelcome ? "opacity-100" : "opacity-0"}`}
                />
                <div className="first-install-exclamation-layer" aria-hidden="true">
                  {isWelcome && (
                    <div className="first-install-exclamation-mask">
                      <span className="first-install-exclamation-mask--one" />
                      <span className="first-install-exclamation-mask--two" />
                      <span className="first-install-exclamation-mask--three" />
                    </div>
                  )}
                  <span className="first-install-exclamation first-install-exclamation--one" />
                  <span className="first-install-exclamation first-install-exclamation--two" />
                  <span className="first-install-exclamation first-install-exclamation--three" />
                </div>
              </div>

              <div className="mt-4 w-full shrink-0 px-5 text-center" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  {isWelcome ? (
                    <motion.div
                      key="welcome"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
                    >
                      <h1 id="first-install-title" tabIndex={-1} className="mt-1 font-display text-2xl leading-tight font-extrabold text-ink-900 outline-none">
                        Welcome, Deal Detective
                      </h1>
                      <p id="first-install-description" className="mt-3 dd-type-body text-stone-700">
                        Specials aren&apos;t always a saving. We check recent prices to see if today&apos;s deals are actually cheaper for you.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="ready"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
                    >
                      <h1 id="first-install-title" tabIndex={-1} className="mt-1 font-display text-2xl leading-tight font-extrabold text-ink-900 outline-none">
                        Ready to investigate?
                      </h1>
                      <p id="first-install-description" className="mt-2 dd-type-body text-stone-700">
                        Browse today&apos;s supermarket specials or take a quick tour.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="shrink-0 px-5 pt-3 pb-safe-sm">
              <AnimatePresence mode="wait" initial={false}>
                {isWelcome ? (
                  <motion.div
                    key="welcome-action"
                    className="flex flex-col gap-3"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
                  >
                    <button type="button" onClick={showExample} className="dd-btn dd-btn-primary min-h-12 w-full">
                      {quizCase || isQuizCaseLoading ? "Show me how" : "Browse deals"}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="ready-actions"
                    className="flex flex-col gap-3"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
                  >
                    <button type="button" onClick={onComplete} className="dd-btn dd-btn-primary min-h-12 w-full">
                      Browse deals
                    </button>
                    <button type="button" onClick={onStartTour} className="dd-btn dd-btn-outline min-h-12 w-full">
                      Take a quick tour
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
