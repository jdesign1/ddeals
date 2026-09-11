"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import type { DealFilter } from "@/lib/deal-filters";
import BottomSheetPortal from "@/components/BottomSheetPortal";

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
                <Image
                  src="/all-checks-login.webp"
                  alt="Dodgy Deal mascot looking for new specials"
                  width={483}
                  height={512}
                  sizes="160px"
                  className="mascot-wave h-auto w-36"
                />
              </div>

              <div className="text-center">
                <h2 id="new-specials-title" className="font-display text-xl font-extrabold text-stone-900">
                  We&rsquo;ve spotted some new specials
                </h2>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  <strong className="font-extrabold text-stone-900">{summary.byStore.woolworths}</strong> at Woolworths, {" "}
                  <strong className="font-extrabold text-stone-900">{summary.byStore.newworld}</strong> at New World. {" "}
                  <strong className="font-extrabold text-stone-900">{summary.byStore.paknsave}</strong> at Pak n Save. {" "}
                  <strong className="font-extrabold text-stone-900">{summary.byStore.foursquare}</strong> at Foursquare.
                </p>
                <p className="mt-3 text-sm font-semibold text-stone-700">Start checking the deals below.</p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => onSelectFilter("real")}
                  className="dd-btn dd-btn-success min-h-14 w-full cursor-pointer"
                >
                  {summary.realDeals} Real deals
                </button>
                <button
                  type="button"
                  onClick={() => onSelectFilter("dodgy")}
                  className="dd-btn dd-btn-outline min-h-14 w-full cursor-pointer"
                >
                  {summary.dodgyDeals} Dodgy deals
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
