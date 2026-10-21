"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import type { UnreadListAlert } from "@/lib/notifications-context";

function formatPrice(value: number | null): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : null;
}

function updateCopy(update: UnreadListAlert): { title: string; description: string; tone: string } {
  const price = formatPrice(update.price) ?? "the current price";
  const previousPrice = formatPrice(update.previous_price);
  const priceChange = typeof update.previous_price === "number" && update.price < update.previous_price && previousPrice
    ? ` Down from ${previousPrice}.`
    : "";

  if (update.event_type === "returned_to_special") {
    return { title: "Back on special", description: `${price} at ${update.store_name}.${priceChange}`, tone: "text-fair-700" };
  }
  if (update.event_type === "better_special_price") {
    return { title: "Price dropped", description: `${price} at ${update.store_name}.${priceChange}`, tone: "text-fair-700" };
  }
  if (update.event_type === "became_real_saver") {
    return { title: "Now a Real Saver", description: `${price} at ${update.store_name}.`, tone: "text-fair-700" };
  }
  if (update.event_type === "became_dodgy" || update.event_type === "dodgy_special") {
    return { title: "Now a Dodgy Deal", description: `${price} at ${update.store_name}.`, tone: "text-alert-700" };
  }
  return { title: "Deal updated", description: `${price} at ${update.store_name}.`, tone: "text-stone-700" };
}

function formatUpdateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Recently";
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(timestamp);
}

export default function WatchlistUpdateSheet({
  open,
  updates,
  onClose,
  onOpenAssessment,
}: {
  open: boolean;
  updates: ReadonlyArray<UnreadListAlert>;
  onClose: () => void;
  onOpenAssessment: () => void;
}) {
  const firstUpdate = updates[0];
  const productName = firstUpdate?.product_name ?? "This watched item";
  const visibleUpdates = updates.slice(0, 4);
  const remainingCount = Math.max(0, updates.length - visibleUpdates.length);

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
              aria-describedby="watchlist-update-description"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 id="watchlist-update-title" className="dd-type-sheet-title text-stone-900">What changed</h2>
                <button type="button" onClick={onClose} aria-label="Close" className="dd-bottom-sheet-close cursor-pointer text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-col gap-5 px-5 py-6 pb-safe-sm">
                <div>
                  <p className="dd-type-body font-bold text-stone-900">{productName}</p>
                  <p id="watchlist-update-description" className="mt-1 dd-type-secondary text-stone-600">
                    {updates.length === 1 ? "There is one new update on your Watchlist." : `${updates.length} new updates on your Watchlist.`}
                  </p>
                </div>

                <ul className="flex flex-col divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white" aria-label={`Updates for ${productName}`}>
                  {visibleUpdates.map((update) => {
                    const copy = updateCopy(update);
                    return (
                      <li key={update.id} className="flex items-start justify-between gap-3 px-4 py-3 first:pt-4 last:pb-4">
                        <div className="min-w-0">
                          <p className={`text-sm font-extrabold ${copy.tone}`}>{copy.title}</p>
                          <p className="mt-0.5 text-[13px] leading-5 text-stone-700">{copy.description}</p>
                        </div>
                        <time dateTime={update.created_at} className="shrink-0 text-[11px] font-semibold text-stone-400">{formatUpdateTime(update.created_at)}</time>
                      </li>
                    );
                  })}
                </ul>
                {remainingCount > 0 && <p className="-mt-2 text-center text-xs font-semibold text-stone-500">Plus {remainingCount} older update{remainingCount === 1 ? "" : "s"}.</p>}

                <div className="flex flex-col gap-3">
                  <button type="button" onClick={onOpenAssessment} className="dd-btn dd-btn-primary w-full cursor-pointer">View deal assessment</button>
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
