"use client";

import type { ReactNode } from "react";

/**
 * Shared "nothing to show, here's why" card for empty states that aren't a
 * load failure (see `ErrorState.tsx`'s own doc comment for the sibling
 * failure-state version -- this mirrors its "why a shared component" and
 * dashed-card reasoning). Added 2026-08-20, per Jay: "Can we use the white
 * card background around all empty state messages for consistency? And
 * centre the text within the card." -- before this, `page.tsx`'s
 * signed-out `MyListSection`, `history/page.tsx`'s signed-out/no-history
 * states, and `lists/page.tsx`'s signed-out/no-lists state each already
 * had their own copy-pasted `rounded-3xl border border-dashed
 * border-stone-200 bg-white py-10 text-center` markup, while several OTHER
 * empty states in the app -- `page.tsx`'s Trending rail (Jay's own example,
 * "No confirmed real-saver deals started in the last week.", surfaced by
 * toggling the store filter pills to a store with nothing confirmed that
 * week) and its Specials-in-your-lists rail, plus `/specials`'s own
 * store-filtered "No specials found" message -- were still bare, un-carded
 * `<p>` tags with none of that chrome. This pulls the card out once rather
 * than copy-pasting it a 4th/5th/6th time, same reasoning `ErrorState.tsx`
 * already used for the failure-state sibling.
 *
 * Deliberately left alone (not folded into this component in this pass):
 *  - The 3 pre-existing inline usages above (`page.tsx` MyListSection,
 *    `history/page.tsx` x2, `lists/page.tsx`) -- they already match this
 *    exact look, so this change is scoped to giving the un-carded messages
 *    the same treatment, not a drive-by rewrite of every already-compliant
 *    call site. A later pass could fold those in too.
 *  - `StoreCompareChart.tsx`'s own "No store data to compare yet." --
 *    that one is a fixed-height placeholder sized to match the real bar
 *    chart it stands in for (`h-56 w-full`, the chart's own
 *    `bg-stone-50`/`border-stone-100` container, not the app's page-level
 *    white-card language), so swapping it for this component would change
 *    that widget's own height/fill, not just its text -- a
 *    different, chart-specific placeholder by design, not a page-level
 *    empty state in the sense this component covers.
 *  - `AddToListButton.tsx`'s "Create a list first" link -- a CTA inside an
 *    already-chromed bottom sheet, not a standalone message.
 *
 * `children` (not a `message` string prop, unlike `ErrorState.tsx`) --
 * `page.tsx`'s Specials-in-your-lists empty state needs an inline `<Link>`
 * to My Lists baked into its own sentence, so this takes arbitrary content
 * instead of forcing every caller through a single string.
 *
 * No horizontal margin baked in (unlike `ErrorState.tsx`'s own `mx-5`) --
 * callers vary on whether their own parent already applies page-edge
 * padding (`page.tsx`'s Trending/Specials-in-your-lists rails both sit
 * inside a `px-5` `<section>` already) or not (`specials/page.tsx`'s
 * `<main>` has none). `className` lets each caller supply its own `mx-5`
 * only where actually needed, rather than this component guessing and
 * either doubling or dropping that inset.
 */
export default function EmptyState({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-3xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center ${className}`}
    >
      <p className="max-w-xs dd-type-secondary text-stone-500">{children}</p>
    </div>
  );
}
