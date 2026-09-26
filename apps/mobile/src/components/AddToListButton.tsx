"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useWatchlist } from "@/lib/watchlist-context";
import BottomSheetPortal from "@/components/BottomSheetPortal";

/**
 * Product-card save action. Tapping an unsaved product stages it in the
 * shared Watchlist selection; the global bottom action bar commits the batch.
 * Keeping this button small and local preserves the card's hit target while
 * avoiding a modal interruption for every item a user wants to save. Tapping
 * a saved checkmark opens a confirmation sheet before removing the product.
 */
export default function AddToListButton({
  productId,
  productName,
  containerClassName = "absolute right-2 top-2 z-10",
  buttonClassName = "flex h-7 w-7 items-center justify-center rounded-full border border-stone-900 bg-white text-stone-900 shadow",
  iconClassName = "h-4 w-4",
}: {
  productId: string;
  productName?: string;
  containerClassName?: string;
  buttonClassName?: string;
  iconClassName?: string;
}) {
  const { user, openAuthSheet } = useAuth();
  const { savedProductIds, selectedProductIds, toggleProduct, removeProduct, removingProductIds, loadingSavedItems } = useWatchlist();
  const [isRemoveSheetOpen, setIsRemoveSheetOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const isSaved = savedProductIds.has(productId);
  const isSelected = selectedProductIds.has(productId);
  const isRemoving = removingProductIds.has(productId);
  const label = productName ? `${productName} — ` : "";

  const handleRemove = async () => {
    setRemoveError(null);
    try {
      await removeProduct(productId);
      setIsRemoveSheetOpen(false);
    } catch {
      setRemoveError("We couldn't remove this product. Please try again.");
    }
  };

  return (
    <>
      <div className={containerClassName}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!user) {
              openAuthSheet("Log in to save products to your Watchlist.");
              return;
            }
            if (isSaved) {
              setRemoveError(null);
              setIsRemoveSheetOpen(true);
              return;
            }
            toggleProduct(productId);
          }}
          aria-label={
            isSaved
              ? `${label}Remove from Watchlist`
              : isSelected
                ? `${label}Deselect from Watchlist`
                : `${label}Add to Watchlist`
          }
          aria-pressed={isSaved || isSelected}
          aria-busy={loadingSavedItems || isRemoving}
          className={`${buttonClassName} ${isSelected ? "ring-2 ring-ink-900/20" : ""}`}
        >
          {isSaved || isSelected ? (
            <Check className={`block ${iconClassName}`} strokeWidth={3} aria-hidden="true" />
          ) : (
            <Plus className={`block ${iconClassName}`} strokeWidth={3} aria-hidden="true" />
          )}
        </button>
      </div>

      <RemoveFromWatchlistSheet
        open={isRemoveSheetOpen}
        productName={productName}
        error={removeError}
        isRemoving={isRemoving}
        onClose={() => {
          if (!isRemoving) setIsRemoveSheetOpen(false);
        }}
        onConfirm={() => void handleRemove()}
      />
    </>
  );
}

function RemoveFromWatchlistSheet({
  open,
  productName,
  error,
  isRemoving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  productName?: string;
  error: string | null;
  isRemoving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close remove from Watchlist confirmation"
              disabled={isRemoving}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="remove-watchlist-title"
              aria-describedby="remove-watchlist-description"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[38vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 id="remove-watchlist-title" className="dd-type-sheet-title text-stone-900">Remove from Watchlist?</h2>
                <button type="button" onClick={onClose} disabled={isRemoving} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-3 px-5 py-5 pb-safe-sm">
                <p id="remove-watchlist-description" className="dd-type-body text-stone-600">
                  {productName ? <><span className="font-bold text-stone-900">{productName}</span> will no longer be tracked for better prices.</> : "This product will no longer be tracked for better prices."}
                </p>
                {error && <p role="alert" className="dd-type-secondary text-alert-700">{error}</p>}
                <div className="mt-auto flex flex-col gap-3 pt-4">
                  <button type="button" onClick={onClose} disabled={isRemoving} className="dd-btn dd-btn-outline-muted w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
                  <button type="button" onClick={onConfirm} disabled={isRemoving} className="dd-btn dd-btn-outline-alert w-full cursor-pointer disabled:cursor-wait disabled:opacity-60">{isRemoving ? "Removing…" : "Remove from Watchlist"}</button>
                </div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
