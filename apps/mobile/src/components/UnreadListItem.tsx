"use client";

import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { UnreadListAlert } from "@/lib/notifications-context";
import WatchlistUpdateSheet from "@/components/WatchlistUpdateSheet";

export default function UnreadListItem({
  listId,
  productId,
  isUnread,
  updates,
  onUpdateClick,
  updateAriaLabel = "View new deal update",
  children,
}: {
  listId: string;
  productId: string;
  isUnread: boolean;
  updates: ReadonlyArray<UnreadListAlert>;
  onUpdateClick?: () => void;
  updateAriaLabel?: string;
  children: ReactNode;
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [visibleUpdates, setVisibleUpdates] = useState<ReadonlyArray<UnreadListAlert>>([]);
  const [viewedUpdateId, setViewedUpdateId] = useState<string | null>(null);
  const latestUpdateId = updates[0]?.id ?? null;
  const hasViewedLatestUpdate = latestUpdateId !== null && viewedUpdateId === latestUpdateId;

  const openSheet = () => {
    if (!updates.length) return;
    setVisibleUpdates(updates);
    setViewedUpdateId(latestUpdateId);
    setIsSheetOpen(true);
    onUpdateClick?.();
  };

  const showUpdateButton = Boolean(onUpdateClick && isUnread && !hasViewedLatestUpdate);

  return (
    <div
      data-list-id={listId}
      data-product-id={productId}
      className="relative"
    >
      {children}
      {showUpdateButton ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openSheet();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={updateAriaLabel}
          aria-expanded={isSheetOpen}
          className="absolute right-0 top-0 z-30 flex h-11 w-11 cursor-pointer items-start justify-end rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-600 focus-visible:ring-offset-1"
        >
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-alert-50 text-alert-700 shadow-xs ring-1 ring-alert-200 transition-colors hover:bg-alert-100">
            <Info className="h-4 w-4" strokeWidth={2.5} />
          </span>
        </button>
      ) : null}
      <WatchlistUpdateSheet open={isSheetOpen} updates={visibleUpdates} onClose={() => setIsSheetOpen(false)} />
    </div>
  );
}
