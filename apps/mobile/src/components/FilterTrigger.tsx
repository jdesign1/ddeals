"use client";

import { ChevronDown, X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Compact trigger used by the filter sheets. The default label stays stable
 * while the toolbar remains width-constrained. When a filter is applied, the
 * separate clear affordance remains keyboard-accessible without turning the
 * whole control into a destructive action.
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
  leading,
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
  leading?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative inline-flex h-11 items-stretch overflow-hidden rounded-lg border bg-white dd-type-control text-stone-700 shadow-none transition-colors hover:bg-stone-50 ${
        active ? "border-stone-950" : "border-stone-300"
      } ${
        fill ? "min-w-0 w-full" : compact ? "min-w-0" : "min-w-0 max-w-44"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup={hasPopup}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        className="flex w-full min-w-0 cursor-pointer items-center justify-center gap-1 px-2 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-1">
          {leading}
          <span className={active ? "whitespace-nowrap" : "truncate"}>{label}</span>
        </span>
        {!active && <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      </button>
      {active && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex w-8 cursor-pointer items-center justify-center text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-900"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
