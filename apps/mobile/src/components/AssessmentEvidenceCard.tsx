"use client";

import { Fragment, memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info, X } from "lucide-react";
import type { AssessmentVerdict, CurrentDeal } from "@dodgey-deals/shared";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import AssessmentText from "@/components/AssessmentText";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import WinkMascot from "@/components/WinkMascot";
import { VERDICT_BADGE } from "@/lib/assessment-verdict";

function formatCountValue(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return String(Math.round(value));
}

function getPriceMovement(deal: CurrentDeal): { direction: "up" | "down"; amount: string } | null {
  if (!Number.isFinite(deal.price) || !Number.isFinite(deal.originalPrice) || deal.originalPrice == null || deal.originalPrice <= 0) {
    return null;
  }

  const difference = deal.price - deal.originalPrice;
  if (Math.abs(difference) < 0.005) return null;

  return {
    direction: difference > 0 ? "up" : "down",
    amount: `$${Math.abs(difference).toFixed(2)}`,
  };
}

function EvidenceTableWithMascot({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative isolate overflow-visible pt-10">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -top-6 left-1/2 z-0 -translate-x-1/2"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.78 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { delay: 0.2, type: "spring", stiffness: 360, damping: 18, mass: 0.7 }
        }
      >
        <WinkMascot className="wink-mascot--evidence" />
      </motion.div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function AssessmentEvidenceCard({
  deal,
  verdict,
  evidenceSummary,
  triggerContent,
  triggerClassName,
  triggerAriaLabel,
  assessmentCopy,
  open,
  onOpenChange,
  compactSpacing = false,
}: {
  deal: CurrentDeal;
  verdict: AssessmentVerdict;
  evidenceSummary: string;
  /** Optional custom content lets the assessment insight itself open this sheet. */
  triggerContent?: ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  assessmentCopy: string;
  /** Optional controlled state lets related assessment controls open this same sheet. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Removes the top gap when this control follows directly after a multi-store summary. */
  compactSpacing?: boolean;
}) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);
  const isOpen = open ?? uncontrolledIsOpen;
  const setIsOpen = onOpenChange ?? setUncontrolledIsOpen;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusRestoreFrameRef = useRef<number | null>(null);
  const titleId = useId();
  const sheetId = useId();
  const ninetyDayChecks = formatCountValue(deal.ninetyDaySamples);
  const trackedDays = formatCountValue(deal.ninetyDayDaysTracked);
  const priceChanges = formatCountValue(deal.ninetyDayPriceChanges);
  const hasEvidenceCounts = ninetyDayChecks != null || trackedDays != null || priceChanges != null;
  const verdictBadge = VERDICT_BADGE[verdict];
  const priceMovement = getPriceMovement(deal);
  const evidenceFooter = "Based on the last 90-days of price history.";
  const assessmentLines = assessmentCopy.split("\n");
  const firstNarrativeLineIndex = assessmentLines.findIndex(
    (line) => !/^(Current price|90-day low|90-day average|Recent normal price):/.test(line),
  );

  useEffect(() => {
    if (!isOpen) return;
    if (focusRestoreFrameRef.current != null) {
      cancelAnimationFrame(focusRestoreFrameRef.current);
      focusRestoreFrameRef.current = null;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      focusRestoreFrameRef.current = requestAnimationFrame(() => {
        focusRestoreFrameRef.current = null;
        if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
        else if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
      });
    };
  }, [isOpen, setIsOpen]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-controls={sheetId}
        aria-label={triggerAriaLabel ?? (triggerContent ? `Open deal evidence: ${evidenceSummary}` : undefined)}
        className={triggerClassName ?? `dd-type-control ${compactSpacing ? "mt-0" : "mt-1"} flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-stone-500 bg-transparent px-3.5 py-3 text-center text-stone-700 transition-colors hover:border-stone-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700`}
      >
        {triggerContent ?? (
          <>
            <span className="min-w-0 text-stone-700">{evidenceSummary}</span>
            <Info className="h-5 w-5 flex-shrink-0 text-stone-900" strokeWidth={2.25} aria-hidden="true" />
          </>
        )}
      </button>

      <BottomSheetPortal open={isOpen}>
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close evidence details"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] border-0 bg-stone-900/40 p-0"
              />
              <motion.div
                id={sheetId}
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                  <h3 id={titleId} className="dd-type-sheet-title text-stone-900">Deal evidence</h3>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close"
                    className="dd-bottom-sheet-close -mr-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="space-y-4 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10">
                  {hasEvidenceCounts && (
                    <EvidenceTableWithMascot>
                      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                        <div className="grid grid-cols-3 divide-x divide-stone-200/80 text-center">
                          <div className="px-2 first:pl-0 last:pr-0">
                            <p className="text-2xl leading-7 font-extrabold text-stone-900">{ninetyDayChecks ?? "—"}</p>
                            <p className="mt-1 text-sm leading-5 font-semibold text-stone-600">Checks</p>
                          </div>
                          <div className="px-2 first:pl-0 last:pr-0">
                            <p className="text-2xl leading-7 font-extrabold text-stone-900">{trackedDays ?? "—"}</p>
                            <p className="mt-1 text-sm leading-5 font-semibold text-stone-600">Days</p>
                          </div>
                          <div className="px-2 first:pl-0 last:pr-0">
                            <p className="text-2xl leading-7 font-extrabold text-stone-900">{priceChanges ?? "—"}</p>
                            <p className="mt-1 text-sm leading-5 font-semibold text-stone-600">Price changes</p>
                          </div>
                        </div>
                      </div>
                    </EvidenceTableWithMascot>
                  )}

                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                      <StoreLogoBadge store={deal.store} variant="compact" />
                      <span className={`dd-badge ${verdictBadge.className}`}>
                        <verdictBadge.icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {verdictBadge.label}
                      </span>
                    </h4>
                    <p className="mt-3 whitespace-pre-line text-[15px] font-normal leading-6 text-stone-700">
                      {assessmentLines.map((line, index) => (
                        <Fragment key={`${line}-${index}`}>
                          <span className={`block ${index === firstNarrativeLineIndex ? "mt-2" : ""}`}>
                            <AssessmentText text={line} />
                          </span>
                          {line.startsWith("Recent normal price:") && priceMovement && (
                            <span
                              className={`mt-1 text-sm font-bold ${
                                priceMovement.direction === "up" ? "text-alert-700" : "text-fair-700"
                              }`}
                            >
                              {priceMovement.amount} {priceMovement.direction === "up" ? "higher" : "lower"} than the recent normal price
                            </span>
                          )}
                        </Fragment>
                      ))}
                    </p>
                    <p className="mt-4 border-t border-stone-100 pt-3 text-[15px] font-normal leading-6 text-stone-700">
                      {evidenceFooter}
                    </p>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>
    </>
  );
}

export default memo(AssessmentEvidenceCard);
