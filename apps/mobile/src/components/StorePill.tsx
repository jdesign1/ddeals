"use client";

import { getStoreLogoMeta } from "@/lib/store-meta";

/**
 * Supermarket filter pill — extracted (2026-08-09) from page.tsx's own
 * inline store-filter-pill row (the "All" + per-store buttons above
 * Home's Trending/My List rails) so `FullScreenSearch.tsx` can render
 * *the same component*, not a separately-styled lookalike, per Jay's ask.
 * Not `FilterPill.tsx` -- that's a visually different pill (`/specials`'
 * plain rounded-full, single brand-primary-green active state, no
 * per-store coloring), a different established convention this app already
 * has for a different screen; this one is specifically Home's own look
 * (rounded-xl border, per-store brand color via `getStoreLogoMeta` when
 * active).
 *
 * Purely presentational -- `active`/`onClick` are the only behavioural
 * inputs, so it works unmodified for both Home's single-select store
 * filter (one selected id at a time) and the full-screen search overlay's
 * multi-select toggle (any number of ids selected at once); the caller
 * decides what "active" and "click" mean, this only renders the result.
 */
export default function StorePill({
  storeKey,
  label,
  active,
  onClick,
}: {
  /** Normalized store key ("newworld", "paknsave", ...) or "all". */
  storeKey: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const meta = storeKey === "all" ? { bg: "bg-stone-900", text: "text-white" } : getStoreLogoMeta(storeKey);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold tracking-wider transition-all duration-150 ${
        active ? `border-transparent ${meta.bg} ${meta.text} shadow-xs` : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
      }`}
    >
      {label}
    </button>
  );
}
