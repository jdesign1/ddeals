"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { DealFilter } from "@/lib/deal-filters";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import MascotImage from "@/components/MascotImage";
import type { NewSpecialsSummary } from "@/lib/new-specials";

interface NewSpecialsModalProps {
  open: boolean;
  summary: NewSpecialsSummary;
  onClose: () => void;
  onSelectFilter: (filter: DealFilter, dealKeys: string[]) => void;
}

export default function NewSpecialsModal({ open, summary, onClose, onSelectFilter }: NewSpecialsModalProps) {
  // Keep the shared viewport lock active until the exit animation finishes.
  // Otherwise the underlying page/nav becomes visible during the modal's
  // fade-and-scale exit, which reads as a flicker on iOS cold starts.
  const [isClosing, setIsClosing] = useState(false);
  const hasNewSpecials = summary.total > 0;
  const hasRatedSpecials = summary.realDeals > 0 || summary.dodgyDeals > 0;
  const storeSummary = [
    { count: summary.byStore.woolworths, store: "Woolworths" },
    { count: summary.byStore.newworld, store: "New World" },
    { count: summary.byStore.paknsave, store: "PAK'nSAVE" },
    { count: summary.byStore.foursquare, store: "Four Square" },
  ]
    .filter(({ count }) => count > 0)
    .map(({ count, store }) => `${count} at ${store}`)
    .join(", ");

  const handleClose = () => {
    setIsClosing(true);
    onClose();
  };

  const handleSelectFilter = (filter: DealFilter, dealKeys: string[]) => {
    setIsClosing(true);
    onSelectFilter(filter, dealKeys);
  };

  return (
    <BottomSheetPortal open={open || isClosing}>
      <AnimatePresence
        onExitComplete={() => {
          if (!open) setIsClosing(false);
        }}
      >
        {open && (
          <>
            <motion.div
              key="new-specials-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={handleClose}
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
                onClick={handleClose}
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
                    : "New deals since your last visit"}
                </h2>
                {!hasNewSpecials ? (
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    There aren&rsquo;t any new specials to show right now. We&rsquo;ll let you know when fresh deals land.
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-6 text-stone-600">
                      {storeSummary ? `New specials at ${storeSummary}.` : `${summary.total} new specials are ready to check.`}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-stone-600">
                      {summary.newlyStarted > 0 && `${summary.newlyStarted} newly started special${summary.newlyStarted === 1 ? "" : "s"}`}
                      {summary.newlyStarted > 0 && summary.priceDrops > 0 && " and "}
                      {summary.priceDrops > 0 && `${summary.priceDrops} price drop${summary.priceDrops === 1 ? "" : "s"}`}
                      {" since your last visit."}
                    </p>
                  </>
                )}
              </div>

              {hasNewSpecials && (
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectFilter("all", summary.allDealKeys)}
                    className="dd-btn dd-btn-primary min-h-14 w-full cursor-pointer"
                  >
                    <span>View {summary.total} new special{summary.total === 1 ? "" : "s"}</span>
                    <ArrowRight className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  </button>
                  {hasRatedSpecials && (
                    <div className={`grid gap-3 ${summary.realDeals > 0 && summary.dodgyDeals > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {summary.realDeals > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSelectFilter("real", summary.realDealKeys)}
                          className="dd-btn dd-btn-outline new-specials-real-button min-h-12 w-full cursor-pointer"
                        >
                          <span>{summary.realDeals} Real deals</span>
                        </button>
                      )}
                      {summary.dodgyDeals > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSelectFilter("dodgy", summary.dodgyDealKeys)}
                          className="dd-btn dd-btn-outline new-specials-dodgy-button min-h-12 w-full cursor-pointer"
                        >
                          <span>{summary.dodgyDeals} Dodgy deals</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!hasNewSpecials && (
                <button
                  type="button"
                  onClick={handleClose}
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
