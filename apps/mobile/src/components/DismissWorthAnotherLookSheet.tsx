"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import BottomSheetPortal from "@/components/BottomSheetPortal";

export default function DismissWorthAnotherLookSheet({
  open,
  itemCount,
  onClose,
  onRemove,
}: {
  open: boolean;
  itemCount: number;
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close Worth another look confirmation"
              onClick={onClose}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="dismiss-worth-another-look-title"
              aria-describedby="dismiss-worth-another-look-description"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[35vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 id="dismiss-worth-another-look-title" className="dd-type-sheet-title text-stone-900">
                  Remove missed items?
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="dd-bottom-sheet-close cursor-pointer text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-3 px-5 py-5 pb-safe-sm">
                <p id="dismiss-worth-another-look-description" className="dd-type-body text-stone-600">
                  Are you sure you want to remove {itemCount === 1 ? "the item" : "items"} you may have missed?
                </p>
                <p className="dd-type-secondary text-stone-500">
                  This only removes these reminders from this belt. Your full All Checks history stays intact.
                </p>
                <div className="mt-auto flex flex-col gap-3 pt-4">
                  <button type="button" onClick={onClose} className="dd-btn dd-btn-outline-muted w-full cursor-pointer">
                    Not now
                  </button>
                  <button type="button" onClick={onRemove} className="dd-btn dd-btn-outline-alert w-full cursor-pointer">
                    Remove items
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
