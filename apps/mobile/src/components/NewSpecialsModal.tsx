"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { DealFilter } from "@/lib/deal-filters";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import MascotImage from "@/components/MascotImage";

export interface NewSpecialsSummary {
  byStore: {
    woolworths: number;
    newworld: number;
    paknsave: number;
    foursquare: number;
  };
  realDeals: number;
  dodgyDeals: number;
  total: number;
}

interface NewSpecialsModalProps {
  open: boolean;
  summary: NewSpecialsSummary;
  onClose: () => void;
  onSelectFilter: (filter: Extract<DealFilter, "real" | "dodgy">) => void;
}

export default function NewSpecialsModal({ open, summary, onClose, onSelectFilter }: NewSpecialsModalProps) {
  const hasNewSpecials = summary.total > 0;
  const hasRatedSpecials = summary.realDeals > 0 || summary.dodgyDeals > 0;

  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="new-specials-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="dd-bottom-sheet-backdrop fixed inset-0 mx-auto w-full max-w-[480px] bg-stone-900/50 backdrop-blur-xs"
            />
            <motion.div
              key="new-specials-modal"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", damping: 25, stiffness: 260 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-specials-title"
              onClick={(event) => event.stopPropagation()}
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-4 top-1/2 mx-auto flex max-h-[calc(100dvh-2rem)] w-auto max-w-[27rem] -translate-y-1/2 flex-col overflow-y-auto rounded-3xl border border-stone-200 px-5 pb-6 pt-5 shadow-2xl"
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close new specials message"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                <span className="text-2xl leading-none" aria-hidden="true">×</span>
              </button>

              <div className="flex justify-center pr-3">
                <MascotImage
                  src="/all-checks-login.webp"
                  darkSrc="/all-checks-login-dark.webp"
                  alt="Dodgy Deal mascot looking for new specials"
                  width={288}
                  height={305}
                  sizes="160px"
                  unoptimized
                  className="mascot-wave h-auto w-36"
                />
              </div>

              <div className="text-center">
                <h2 id="new-specials-title" className="font-display text-xl font-extrabold text-stone-900">
                  {!hasNewSpecials
                    ? "You’re all caught up"
                    : hasRatedSpecials
                      ? "We’ve spotted some new specials"
                      : "Fresh specials are here"}
                </h2>
                {!hasNewSpecials ? (
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    There aren&rsquo;t any new specials to show right now. We&rsquo;ll let you know when fresh deals land.
                  </p>
                ) : !hasRatedSpecials ? (
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    We found fresh specials, but none have a confirmed Real Saver or Dodgy rating yet.
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-6 text-stone-600">
                      <strong className="font-extrabold text-stone-900">{summary.byStore.woolworths}</strong>{" "}at Woolworths,{" "}
                      <strong className="font-extrabold text-stone-900">{summary.byStore.newworld}</strong>{" "}at New World,{" "}
                      <strong className="font-extrabold text-stone-900">{summary.byStore.paknsave}</strong>{" "}at PAK&apos;nSAVE, and{" "}
                      <strong className="font-extrabold text-stone-900">{summary.byStore.foursquare}</strong>{" "}at Four Square.
                    </p>
                    <p className="mt-3 text-sm font-semibold text-stone-700">Start checking the deals below.</p>
                  </>
                )}
              </div>

              {hasRatedSpecials ? (
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectFilter("real")}
                    className="dd-btn dd-btn-outline new-specials-real-button min-h-14 w-full cursor-pointer"
                  >
                    <span>{summary.realDeals} Real deals</span>
                    <ArrowRight className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectFilter("dodgy")}
                    className="dd-btn dd-btn-outline new-specials-dodgy-button min-h-14 w-full cursor-pointer"
                  >
                    <span>{summary.dodgyDeals} Dodgy deals</span>
                    <ArrowRight className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="dd-btn dd-btn-primary mt-6 min-h-14 w-full cursor-pointer"
                >
                  Back to deals
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
