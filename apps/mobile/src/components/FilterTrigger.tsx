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
      className={`relative inline-flex h-11 items-stretch ${
        fill ? "min-w-0 w-full" : compact ? "min-w-0" : "min-w-0 max-w-44"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 inset-y-1 rounded-full border bg-white shadow-none transition-colors ${
          active ? "border-stone-950" : "border-stone-300"
        }`}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup={hasPopup}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        className="absolute inset-0 z-0 cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1"
      />
      <span className={`pointer-events-none relative z-10 flex h-11 w-full min-w-0 items-center justify-center dd-type-control text-stone-700 ${compact ? "pl-3 pr-8" : "px-2 pr-8"}`}>
        <span className="flex min-w-0 items-center gap-1">
          {leading}
          <span className="whitespace-nowrap">{label}</span>
        </span>
      </span>
      <span className="pointer-events-none absolute inset-y-1 right-0 z-10 flex w-8 items-center justify-center">
        {active ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${ariaLabel.toLowerCase()}`}
            className="pointer-events-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        )}
      </span>
    </div>
  );
}
