"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CompactProductInfoCard from "@/components/CompactProductInfoCard";
import type { UnreadListAlert } from "@/lib/notifications-context";
import { collapseWatchlistUpdates, getWatchlistUpdateCopy } from "@/lib/watchlist-update-copy";

function formatUpdateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Recently";
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(timestamp);
}

export default function WatchlistUpdateSheet({
  open,
  updates,
  onClose,
  onExited,
  onOpenAssessment,
  productBrand,
  productImage,
  productUnit,
}: {
  open: boolean;
  updates: ReadonlyArray<UnreadListAlert>;
  onClose: () => void;
  onExited?: () => void;
  onOpenAssessment?: () => void;
  productBrand?: string | null;
  productImage?: string | null;
  productUnit?: string | null;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const collapsedUpdates = collapseWatchlistUpdates(updates);
  const firstUpdate = collapsedUpdates[0];
  const productName = firstUpdate?.product_name ?? "This watched item";
  const visibleUpdates = collapsedUpdates.slice(0, 4);
  const remainingCount = Math.max(0, collapsedUpdates.length - visibleUpdates.length);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && firstUpdate && (
          <>
            <motion.button
              type="button"
              aria-label="Close deal update"
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="watchlist-update-title"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onAnimationComplete={() => {
                if (!open) onExited?.();
              }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 id="watchlist-update-title" className="dd-type-sheet-title text-stone-900">What changed</h2>
                <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close" className="dd-bottom-sheet-close cursor-pointer text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <CompactProductInfoCard
                productName={productName}
                productBrand={productBrand}
                productImage={productImage}
                productUnit={productUnit}
                currentStore={firstUpdate?.store_name}
                currentPrice={firstUpdate?.price}
              />

              <div className="flex flex-col gap-5 px-5 py-6 pb-safe-sm">

                <ul className="flex flex-col divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white" aria-label={`Updates for ${productName}`}>
                  {visibleUpdates.map((update) => {
                    const copy = getWatchlistUpdateCopy(update);
                    return (
                      <li key={update.id} className="px-4 py-3 first:pt-4 last:pb-4">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-baseline justify-between gap-2">
                            <p className={`min-w-0 truncate text-sm font-extrabold ${copy.toneClass}`}>{copy.title}</p>
                            <time dateTime={update.created_at} className="shrink-0 text-[11px] font-semibold text-stone-400">{formatUpdateTime(update.created_at)}</time>
                          </div>
                          <p className="mt-0.5 max-w-full truncate whitespace-nowrap text-[13px] leading-5 text-stone-700">
                            {copy.description.split(/(\$\d+\.\d{2})/g).map((part, index) => (
                              /^\$\d+\.\d{2}$/.test(part)
                                ? <strong key={`${update.id}-price-${index}`} className="font-extrabold text-stone-900">{part}</strong>
                                : <span key={`${update.id}-text-${index}`}>{part}</span>
                            ))}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {remainingCount > 0 && <p className="-mt-2 text-center text-xs font-semibold text-stone-500">Plus {remainingCount} older update{remainingCount === 1 ? "" : "s"}.</p>}

                <div className="flex flex-col gap-3">
                  {onOpenAssessment && <button type="button" onClick={onOpenAssessment} className="dd-btn dd-btn-primary w-full cursor-pointer">View deal assessment</button>}
                  <button type="button" onClick={onClose} className="dd-btn dd-btn-outline-muted w-full cursor-pointer">Close</button>
                </div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
