"use client";

import { Info, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { UnreadListAlert } from "@/lib/notifications-context";
import { getWatchlistUpdateCopy } from "@/lib/watchlist-update-copy";

const POPOVER_WIDTH = 288;
const VIEWPORT_MARGIN = 16;

function popoverPosition(trigger: DOMRect): CSSProperties {
  const width = Math.min(POPOVER_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2));
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, trigger.right - width),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
  );
  const spaceBelow = Math.max(0, window.innerHeight - trigger.bottom - VIEWPORT_MARGIN);
  const spaceAbove = Math.max(0, trigger.top - VIEWPORT_MARGIN);
  const placeBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
  const availableHeight = Math.max(
    120,
    Math.min(window.innerHeight - VIEWPORT_MARGIN * 2, placeBelow ? spaceBelow : spaceAbove),
  );

  return placeBelow
    ? { top: trigger.bottom + 8, left, width, maxHeight: availableHeight }
    : { bottom: window.innerHeight - trigger.top + 8, left, width, maxHeight: availableHeight };
}

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
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [visibleUpdates, setVisibleUpdates] = useState<ReadonlyArray<UnreadListAlert>>([]);
  const [viewedUpdateId, setViewedUpdateId] = useState<string | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = `watchlist-update-${listId}-${productId}`;
  const latestUpdateId = updates[0]?.id ?? null;
  const hasViewedLatestUpdate = latestUpdateId !== null && viewedUpdateId === latestUpdateId;

  useEffect(() => {
    if (!isTooltipOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsTooltipOpen(false);
        setPopoverStyle(null);
      }
    };
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (trigger) setPopoverStyle(popoverPosition(trigger.getBoundingClientRect()));
    };
    const frame = window.requestAnimationFrame(() => {
      updatePosition();
      closeButtonRef.current?.focus();
    });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isTooltipOpen]);

  useEffect(() => {
    if (!isTooltipOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setIsTooltipOpen(false);
      setPopoverStyle(null);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [isTooltipOpen]);

  const openTooltip = () => {
    if (!updates.length) return;
    const trigger = triggerRef.current;
    if (trigger) setPopoverStyle(popoverPosition(trigger.getBoundingClientRect()));
    setVisibleUpdates(updates);
    setViewedUpdateId(latestUpdateId);
    setIsTooltipOpen(true);
    onUpdateClick?.();
  };

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isTooltipOpen) return;
    const target = event.target as Node;
    if (popoverRef.current?.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsTooltipOpen(false);
    setPopoverStyle(null);
  };

  const showUpdateButton = Boolean(onUpdateClick && isUnread && !hasViewedLatestUpdate);
  const tooltip = isTooltipOpen && visibleUpdates.length > 0 && popoverStyle && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={popoverRef}
        id={tooltipId}
        role="dialog"
        aria-labelledby={`${tooltipId}-title`}
        aria-describedby={`${tooltipId}-description`}
        style={popoverStyle}
        className="fixed z-[100] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-3 shadow-xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id={`${tooltipId}-title`} className="dd-type-meta dd-type-meta-strong text-stone-900">What changed</p>
            <p className="mt-0.5 text-[11px] font-semibold text-stone-500">New Watchlist update</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => {
              setIsTooltipOpen(false);
              setPopoverStyle(null);
            }}
            aria-label="Close deal update"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div id={`${tooltipId}-description`} className="mt-2 flex flex-col gap-2">
          {visibleUpdates.slice(0, 3).map((update) => {
            const copy = getWatchlistUpdateCopy(update);
            return (
              <div key={update.id}>
                <p className={`text-sm font-extrabold ${copy.toneClass}`}>{copy.title}</p>
                <p className="mt-0.5 text-[12px] leading-4 text-stone-700">{copy.description}</p>
              </div>
            );
          })}
        </div>
        {visibleUpdates.length > 3 && <p className="mt-2 text-[11px] font-semibold text-stone-500">Plus {visibleUpdates.length - 3} more update{visibleUpdates.length - 3 === 1 ? "" : "s"}.</p>}
      </div>,
      document.body,
    )
    : null;

  return (
    <div
      data-list-id={listId}
      data-product-id={productId}
      className="relative"
      onPointerDownCapture={handlePointerDownCapture}
    >
      {children}
      {showUpdateButton ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openTooltip();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          ref={triggerRef}
          aria-label={updateAriaLabel}
          aria-expanded={false}
          aria-controls={tooltipId}
          className="absolute right-0 top-0 z-30 flex h-11 w-11 cursor-pointer items-start justify-end rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-600 focus-visible:ring-offset-1"
        >
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-alert-50 text-alert-700 shadow-xs ring-1 ring-alert-200 transition-colors hover:bg-alert-100">
            <Info className="h-4 w-4" strokeWidth={2.5} />
          </span>
        </button>
      ) : null}
      {tooltip}
    </div>
  );
}
