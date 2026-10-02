"use client";

import { ChevronDown, X } from "lucide-react";

/**
 * Compact trigger used by the filter sheets. Keeping the value in a
 * truncating text slot means multi-select labels never widen the toolbar or
 * wrap onto a second line. When a filter is applied, the separate clear
 * affordance remains keyboard-accessible without turning the whole control
 * into a destructive action.
 */
export default function FilterTrigger({
  label,
  active,
  onOpen,
  onClear,
  ariaLabel,
  expanded = false,
  compact = false,
  hasPopup = "dialog",
  fill = false,
}: {
  label: string;
  active: boolean;
  onOpen: () => void;
  onClear: () => void;
  ariaLabel: string;
  expanded?: boolean;
  compact?: boolean;
  hasPopup?: "dialog" | "listbox";
  fill?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex h-11 items-stretch overflow-hidden rounded-lg border border-stone-300 bg-white dd-type-control text-stone-700 shadow-none transition-colors hover:bg-stone-50 ${
        fill ? "min-w-0 w-full flex-1 basis-0" : compact ? "min-w-0" : "min-w-0 max-w-44"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup={hasPopup}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 px-3 py-2 text-left"
      >
        <span className="truncate">{label}</span>
        {!active && <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      </button>
      {active && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          className="flex w-8 shrink-0 cursor-pointer items-center justify-center text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-900"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
