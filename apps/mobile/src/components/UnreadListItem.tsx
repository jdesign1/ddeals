"use client";

import type { ReactNode } from "react";

export default function UnreadListItem({
  listId,
  productId,
  isUnread,
  children,
}: {
  listId: string;
  productId: string;
  isUnread: boolean;
  children: ReactNode;
}) {
  return (
    <div data-list-id={listId} data-product-id={productId} className="relative">
      {children}
      {isUnread && (
        <span
          role="img"
          aria-label="New deal update"
          className="pointer-events-none absolute right-2.5 top-2.5 z-30 h-2.5 w-2.5 rounded-full bg-alert-600 ring-2 ring-white"
        />
      )}
    </div>
  );
}
