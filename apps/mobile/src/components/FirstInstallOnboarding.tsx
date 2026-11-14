"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export default function FirstInstallOnboarding({
  onComplete,
  onStartTour,
}: {
  onComplete: () => void;
  onStartTour: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [step]);

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
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.querySelector("h1"))) {
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

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex justify-center bg-[#faf8f4] text-stone-900"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-install-title"
      aria-describedby="first-install-description"
    >
      <div className="flex h-full max-h-[100dvh] w-full max-w-[480px] flex-col px-5" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto py-3">
          <div className="relative -mx-5 aspect-square w-[calc(100%+2.5rem)] max-w-[480px] shrink-0 overflow-hidden">
            <Image
              src={step === 1 ? "/first-install-welcome.webp" : "/first-install-inspect.webp"}
              alt={step === 1
                ? "The Dodgy Deal mascot thoughtfully comparing specials in a supermarket aisle"
                : "The Dodgy Deal mascot inspecting a supermarket special with a magnifying glass"}
              fill
              sizes="100vw"
              preload={step === 1}
              className="object-cover"
            />
          </div>

          <div className="mt-3 w-full shrink-0 text-center" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              {step === 1 ? (
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
                    Help us uncover which supermarket specials are genuine savings and which are just clever pricing.
                    Together, we&apos;re bringing more price transparency to Aotearoa New Zealand.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="start"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
                >
                  <h1 id="first-install-title" tabIndex={-1} className="mt-1 font-display text-2xl leading-tight font-extrabold text-ink-900 outline-none">
                    Ready to investigate?
                  </h1>
                  <p id="first-install-description" className="mt-2 dd-type-secondary text-stone-700">
                    Start exploring, or take a quick guided tour.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 pt-3 pb-safe-sm">
          {step === 1 ? (
            <button type="button" onClick={() => setStep(2)} className="dd-btn dd-btn-primary min-h-12 w-full">
              Next
            </button>
          ) : (
            <>
              <button type="button" onClick={onComplete} className="dd-btn dd-btn-primary min-h-12 w-full">
                Get started now
              </button>
              <button
                type="button"
                onClick={onStartTour}
                className="dd-btn dd-btn-outline min-h-12 w-full"
              >
                How to use Dodgy Deal
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
