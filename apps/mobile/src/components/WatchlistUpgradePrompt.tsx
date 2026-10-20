"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import BottomSheetPortal from "@/components/BottomSheetPortal";

export default function WatchlistUpgradePrompt({
  open,
  onClose,
  onSubscribe,
}: {
  open: boolean;
  onClose: () => void;
  onSubscribe: () => void;
}) {
  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close Watchlist subscription prompt"
              onClick={onClose}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="watchlist-upgrade-prompt-title"
              aria-describedby="watchlist-upgrade-prompt-description"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[30vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 id="watchlist-upgrade-prompt-title" className="dd-type-sheet-title text-stone-900">
                  Subscribe for unlimited watchlist items
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-4 px-5 py-5 pb-safe-sm">
                <p id="watchlist-upgrade-prompt-description" className="dd-type-body text-stone-600">
                  Keep every item you save available in your Watchlist with a subscription.
                </p>
                <div className="mt-auto flex flex-col items-center gap-3 pt-3">
                  <button
                    type="button"
                    onClick={onSubscribe}
                    className="cursor-pointer text-sm font-extrabold text-ink-900 underline decoration-2 underline-offset-4 transition-colors hover:text-fair-700"
                  >
                    Subscribe
                  </button>
                  <button type="button" onClick={onClose} className="dd-btn dd-btn-outline-muted w-full cursor-pointer">
                    No thanks
                  </button>
                </div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
