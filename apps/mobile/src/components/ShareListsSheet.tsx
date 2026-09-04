"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Share, X } from "lucide-react";
import type { ListItemProductMeta, ListItemRow, ListRow } from "@dodgey-deals/shared";
import BottomSheetPortal from "@/components/BottomSheetPortal";

function buildShareText(
  selectedLists: ListRow[],
  itemsByList: Map<string, ListItemRow[]>,
  productMeta: Map<string, ListItemProductMeta>,
): string {
  const sections = selectedLists.map((list) => {
    const items = itemsByList.get(list.id) ?? [];
    const itemLines = items.length
      ? items.map((item) => {
          const name = productMeta.get(item.product_id)?.name ?? "Item";
          return `• ${name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`;
        })
      : ["• No items yet"];
    return [list.name, ...itemLines].join("\n");
  });

  return ["Dodgey Deals shopping lists", ...sections].join("\n\n");
}

function isShareCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function ShareListsSheet({
  open,
  lists,
  itemsByList,
  productMeta,
  onClose,
}: {
  open: boolean;
  lists: ListRow[];
  itemsByList: Map<string, ListItemRow[]>;
  productMeta: Map<string, ListItemProductMeta>;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLists = useMemo(
    () => lists.filter((list) => selectedIds.has(list.id)),
    [lists, selectedIds],
  );

  function close() {
    setSelectedIds(new Set());
    setError(null);
    onClose();
  }

  function toggleList(listId: string) {
    setError(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  }

  async function handleShare() {
    if (!selectedLists.length) return;
    if (typeof navigator === "undefined" || !navigator.share) {
      setError("Sharing isn't available on this device.");
      return;
    }

    setSharing(true);
    setError(null);
    try {
      await navigator.share({
        title: selectedLists.length === 1 ? selectedLists[0].name : "Dodgey Deals shopping lists",
        text: buildShareText(selectedLists, itemsByList, productMeta),
      });
      close();
    } catch (shareError) {
      // Dismissing Apple's share sheet is an expected cancellation, not an
      // error state that should interrupt list selection.
      if (!isShareCancellation(shareError)) setError("We couldn't open the share sheet. Please try again.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close share lists"
              className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
              onClick={close}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-lists-title"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex max-h-[82vh] min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
            >
              <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 py-4">
                <div>
                  <h3 id="share-lists-title" className="dd-type-sheet-title text-stone-900">Share lists</h3>
                  <p className="mt-1 dd-type-secondary text-stone-500">Choose one or more lists to share.</p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
                {lists.length ? (
                  lists.map((list) => {
                    const selected = selectedIds.has(list.id);
                    const itemCount = itemsByList.get(list.id)?.length ?? 0;
                    return (
                      <button
                        key={list.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleList(list.id)}
                        className="flex w-full items-center gap-3 border-b border-stone-100 py-4 text-left transition-colors last:border-b-0 hover:bg-stone-50"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                            selected ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-transparent"
                          }`}
                          aria-hidden="true"
                        >
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate dd-type-control text-stone-800">{list.name}</span>
                          <span className="mt-0.5 block dd-type-meta text-stone-500">
                            {itemCount} {itemCount === 1 ? "item" : "items"}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="py-8 text-center dd-type-secondary text-stone-500">No lists available to share.</p>
                )}
              </div>

              <div className="dd-sheet-cta-footer border-t border-stone-100 px-5 pt-3">
                {error && <p className="mb-3 dd-type-meta dd-type-meta-strong text-alert-700">{error}</p>}
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  disabled={sharing || selectedLists.length === 0}
                  className="dd-btn dd-btn-primary flex w-full items-center justify-center gap-2 cursor-pointer font-display disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Share className="h-5 w-5" aria-hidden="true" />
                  {sharing ? "Preparing…" : "Share"}
                </button>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
