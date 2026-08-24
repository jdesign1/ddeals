"use client";

import { AnimatePresence, motion } from "motion/react";
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
 * inputs, so it works unmodified for the shared multi-select store filter
 * used by both Check deals and the full-screen search overlay; the caller
 * decides what "active" and "click" mean, this only renders the result.
 *
 * Active fill now animates in/out (2026-08-20, per Jay: "Use the same fill
 * animation (used in tabs) when selecting supermarket pills - respect each
 * pills different colour values") -- same `AnimatePresence` +
 * absolutely-positioned `motion.span` pop-in already used for every tab
 * track in this app (`AuthSheet.tsx`, `BottomNav.tsx`, `app/page.tsx`,
 * `FullScreenSearch.tsx`'s own Dodgy/All-specials tabs -- see their own
 * doc comments, including the 2026-08-20 `z-0`/stacking-context bug-fix
 * write-up that applies here too, hence this button also carries `relative
 * z-0`). The one real difference from every existing usage of that
 * pattern: those are all a single fixed `bg-stone-900` fill regardless of
 * which tab is active, where this pill's fill color is per-store
 * (`meta.bg` -- `getStoreLogoMeta`'s own emerald/amber/rose/green per
 * supermarket, or the hardcoded `bg-stone-900` for the "all" pill) --
 * `meta.bg` moved off the button's own conditional className and onto the
 * animated fill `motion.span` instead, so tapping between two different
 * stores animates a scale/opacity pop from THAT store's own color, not a
 * re-color of a single static fill. `meta.text` stays on the button
 * itself (its label needs to be legible against whatever `meta.bg` is
 * currently animating in behind it, not something worth animating on its
 * own), and `transition-all` narrowed to `transition-colors` -- the
 * background swap is now the fill layer's job, so the button element
 * itself only ever transitions its own border/text color, matching what
 * every other fill-pop-in button in this app already does.
 *
 * Border dropped 2026-08-21, per Jay: "Update the pills and tabs to have no
 * border lines, and short tight drop shadows instead." `shadow-sm` added to
 * the button itself (unconditionally -- both active/inactive states get the
 * same resting elevation now that neither has a border to lean on) in place
 * of the old `border`/`border-transparent`/`border-stone-200` trio. The
 * active fill's own `shadow-xs` (below, on the `motion.span`) is untouched
 * -- a separate, smaller accent shadow on the color pop-in itself, not the
 * thing this ask was about.
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
      className={`relative z-0 flex-shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] leading-4 font-bold tracking-wider shadow-sm transition-colors duration-150 ${
        active ? meta.text : "bg-white text-stone-600 hover:bg-stone-50"
      }`}
    >
      <AnimatePresence>
        {active && (
          <motion.span
            className={`absolute inset-0 rounded-xl shadow-xs ${meta.bg}`}
            style={{ zIndex: -1 }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
      </AnimatePresence>
      {label}
    </button>
  );
}
