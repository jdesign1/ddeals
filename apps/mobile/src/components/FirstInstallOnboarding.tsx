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
      <div className="flex h-full max-h-[100dvh] w-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
          <div className="relative aspect-square w-full shrink-0 overflow-hidden">
            <Image
              src="/first-install-welcome.webp"
              alt={step === 1 ? "The Dodgy Deal mascot thoughtfully comparing specials in a supermarket aisle" : ""}
              aria-hidden={step !== 1}
              fill
              sizes="100vw"
              preload
              className={`object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none ${step === 1 ? "opacity-100" : "opacity-0"}`}
            />
            <Image
              src="/first-install-inspect.webp"
              alt={step === 2 ? "The Dodgy Deal mascot inspecting a supermarket special with a magnifying glass" : ""}
              aria-hidden={step !== 2}
              fill
              sizes="100vw"
              preload
              className={`object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none ${step === 2 ? "opacity-100" : "opacity-0"}`}
            />
            <div className="first-install-exclamation-layer" aria-hidden="true">
              {step === 1 && (
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
                    Start exploring current deals in NZ, or take a quick tour on how to use the app.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="shrink-0 px-5 pt-3 pb-safe-sm">
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 ? (
              <motion.div
                key="next-action"
                className="flex flex-col gap-3"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
              >
                <button type="button" onClick={() => setStep(2)} className="dd-btn dd-btn-primary min-h-12 w-full">
                  Next
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="start-actions"
                className="flex flex-col gap-3"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
