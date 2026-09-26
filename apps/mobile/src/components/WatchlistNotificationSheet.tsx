"use client";

import { BellRing, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { PermissionState } from "@capacitor/core";
import BottomSheetPortal from "@/components/BottomSheetPortal";

export default function WatchlistNotificationSheet({
  open,
  itemCount,
  permissionState,
  isSaving,
  error,
  onClose,
  onEnable,
  onOpenSettings,
}: {
  open: boolean;
  itemCount: number;
  permissionState: PermissionState | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onEnable: () => void;
  onOpenSettings: () => void;
}) {
  const permissionDenied = permissionState === "denied";

  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close notification prompt"
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="watchlist-notification-title"
              aria-describedby="watchlist-notification-description"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 id="watchlist-notification-title" className="dd-type-sheet-title text-stone-900">
                  Get price alerts
                </h2>
                <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-col gap-5 px-5 py-6 pb-safe-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fair-50 text-fair-700" aria-hidden="true">
                    <BellRing className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div>
                    <p className="dd-type-body font-bold text-stone-900">
                      {itemCount === 1 ? "Your item is saved." : `${itemCount} items are saved.`}
                    </p>
                    <p id="watchlist-notification-description" className="mt-1 dd-type-body text-stone-600">
                      {permissionDenied
                        ? "Allow notifications in iPhone Settings to hear when something on your Watchlist gets a better price."
                        : "Turn on notifications and we’ll let you know when something goes on special again or gets meaningfully cheaper."}
                    </p>
                  </div>
                </div>

                {error && <p role="alert" className="dd-type-secondary text-alert-700">{error}</p>}

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={permissionDenied ? onOpenSettings : onEnable}
                    disabled={isSaving}
                    className="dd-btn dd-btn-primary w-full cursor-pointer disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSaving ? "Updating…" : permissionDenied ? "Open iPhone Settings" : "Turn on notifications"}
                  </button>
                  <button type="button" onClick={onClose} disabled={isSaving} className="dd-btn dd-btn-outline-muted w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
                    Not now
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
