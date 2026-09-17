"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function UnreadListItem({
  listId,
  productId,
  isUnread,
  onViewed,
  children,
}: {
  listId: string;
  productId: string;
  isUnread: boolean;
  onViewed: () => void;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || !isUnread) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          onViewed();
          observer.disconnect();
        }
      },
      {
        root: document.querySelector(".mobile-scroll-surface"),
        threshold: 0.5,
      }
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [isUnread, onViewed]);

  return (
    <div ref={rowRef} data-list-id={listId} data-product-id={productId} className="relative">
      {children}
      {isUnread && (
        <span className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-alert-600 px-2 py-0.5 text-[10px] font-bold leading-4 text-white shadow-sm">
          New
        </span>
      )}
    </div>
  );
}
