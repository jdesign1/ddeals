"use client";

import { Check, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useWatchlist } from "@/lib/watchlist-context";

/**
 * Product-card save action. Tapping an unsaved product stages it in the
 * shared Watchlist selection; the global bottom action bar commits the batch.
 * Keeping this button small and local preserves the card's hit target while
 * avoiding a modal interruption for every item a user wants to save.
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
  const { savedProductIds, selectedProductIds, toggleProduct, loadingSavedItems } = useWatchlist();
  const isSaved = savedProductIds.has(productId);
  const isSelected = selectedProductIds.has(productId);
  const label = productName ? `${productName} — ` : "";

  return (
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
          // A saved checkmark is a stable state indicator. Removal remains a
          // deliberate action from Watchlist, where the existing swipe-to-
          // remove confirmation prevents accidental loss.
          if (!isSaved) toggleProduct(productId);
        }}
        aria-label={
          isSaved
            ? `${label}Already in Watchlist`
            : isSelected
              ? `${label}Deselect from Watchlist`
              : `${label}Add to Watchlist`
        }
        aria-pressed={isSaved || isSelected}
        aria-busy={loadingSavedItems}
        className={`${buttonClassName} ${isSelected ? "ring-2 ring-ink-900/20" : ""}`}
      >
        {isSaved || isSelected ? (
          <Check className={`block ${iconClassName}`} strokeWidth={3} aria-hidden="true" />
        ) : (
          <Plus className={`block ${iconClassName}`} strokeWidth={3} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
