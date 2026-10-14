"use client";

import type { ReactNode } from "react";

export default function UnreadListItem({
  listId,
  productId,
  isUnread,
  onUpdateClick,
  updateAriaLabel = "View new deal update",
  children,
}: {
  listId: string;
  productId: string;
  isUnread: boolean;
  onUpdateClick?: () => void;
  updateAriaLabel?: string;
  children: ReactNode;
}) {
  return (
    <div data-list-id={listId} data-product-id={productId} className="relative">
      {children}
      {isUnread && onUpdateClick ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onUpdateClick();
          }}
          aria-label={updateAriaLabel}
          className="absolute right-0 top-0 z-30 flex h-11 w-11 cursor-pointer items-start justify-end rounded-full p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-alert-600 ring-2 ring-white" />
        </button>
      ) : isUnread ? (
        <span role="img" aria-label="New deal update" className="pointer-events-none absolute right-2.5 top-2.5 z-30 h-2.5 w-2.5 rounded-full bg-alert-600 ring-2 ring-white" />
      ) : null}
    </div>
  );
}
