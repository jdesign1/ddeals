import { ArrowDown, ArrowUp, Equal, Tag } from "lucide-react";

import { isUncertainAssessment, type AssessmentVerdict, type PriceHistoryInsight } from "@dodgey-deals/shared";
import AssessmentText from "@/components/AssessmentText";

/**
 * Price History Insights block on the deal-assessment page -- ALL FOUR
 * stats (90-Day Low/High/Average + duration-weighted discount frequency,
 * from `buildPriceHistoryInsights()`, packages/shared/src/deal-detail.ts)
 * in one 2x2 grid, not 4 separate cards.
 *
 * Changed 2026-08-20, per Jay's ask (one of several carousel UX options
 * discussed, this one picked as "option 2"): the original version gave
 * each insight its OWN full-height carousel slide -- 4 near-identical
 * big-number cards, a lot of swiping for very little payoff per swipe.
 * Merged into one grid instead. Pairing is deliberate, by MEANING, not
 * just source order: Low+High (top row) both answer "how far does the
 * price swing"; Avg+Frequency (bottom row) both answer "what's typical" --
 * this happens to already match `buildPriceHistoryInsights()`'s own
 * [low, high, avg, frequency] return order, so no reordering needed here,
 * just a grid instead of a stack. `divide-x`/`divide-y` draw the internal
 * grid lines without a second background-color layer.
 *
 * Changed again 2026-08-20 (same day, follow-up ask): this block and
 * `StoreCompareChart` were originally the 2 slides of a swipeable
 * `InsightCarousel` (this one only visible if the user swiped). Per Jay's
 * ask, both are now always-visible, stacked blocks on the deal page
 * instead -- `InsightCarousel` is no longer used anywhere in this app (see
 * `apps/mobile/src/app/deal/[id]/[store]/page.tsx`). `h-56` kept as this
 * card's own fixed height (was originally set to match `StoreCompareChart`
 * for carousel-swipe height-consistency, a reason that no longer applies
 * now that nothing swipes -- kept anyway since it still sizes this grid
 * well on its own merits, not carried over by inertia).
 *
 * Still "one glanceable stat block, not a data table" -- the spec's own
 * stated goal for this section (step 4: "presented in a simple, digestible
 * format... without requiring [users] to interpret detailed charts or
 * large amounts of data") -- just 4 numbers at once, still no chart, no
 * scrolling table. Smaller type than the original single-card version
 * (text-lg vs text-3xl headline) since 4 now share one `h-56` card instead
 * of each getting its own; `line-clamp-2` on the detail line keeps the
 * frequency cell's longer text from overflowing its quarter of the card.
 *
 * Frequency tile trimmed 3 lines -> 2 (2026-08-21, per Jay: "the 4th tile
 * is a bit packed with info ... could we simplify it to: Frequently on
 * special / 47 times in the last 90 days") -- see `deal-detail.ts`'s own
 * doc comment on `buildPriceHistoryInsights` for the copy change itself;
 * this file's own change is just the `insight.label && (...)` guard right
 * below, needed now that this one tile's label is legitimately empty.
 * Small-caption label text also bumped `text-[10px]` -> `text-sm` (14px)
 * same day, per Jay's separate ask on that exact class string. Also same
 * day, per Jay's "titles should be sentence case" ask: `uppercase`
 * removed (a CSS text-transform that force-displays ALL CAPS regardless of
 * the source string's own casing -- sentence-casing `insight.label` in
 * deal-detail.ts alone would have had zero visible effect without also
 * dropping this class), and `tracking-widest` (sized for all-caps
 * letterforms) swapped for `tracking-wide`.
 *
 * Icons, per-tile color tints, and 2 more text-size tweaks added
 * 2026-08-21, per Jay's ask on this same grid: '"46 times in the last 90
 * days", change to 14px' (the detail line, `text-[10px]` -> `text-sm`,
 * same 14px token already used for the label above it -- this was the one
 * piece of text on the tile still left at the old 10px size), 'reduce the
 * text size of "Frequently on special"' (the frequency tile's own
 * headline/`value` -- scoped to JUST that tile via `insight.key ===
 * "frequency"` below, not all 4 headlines: the $ values on the other 3
 * tiles are short, fixed-width numbers with no wrapping risk, so nothing
 * about them prompted the same "reduce" ask -- `text-lg` -> `text-base`
 * for this one tile only), 'give each grid tile a subtle subtle colour
 * tint (stay away from reds and oranges)' (`TILE_STYLE` below, first pass:
 * all 4 in cool blue/purple/teal/green tones, deliberately clear of red/
 * orange), and 'give each tile an appropriate icon above the texts'
 * (down/up arrows for low/high -- same direction metaphor the price-
 * ranking rows on this page already use for cheaper/pricier, `Equal` for
 * average since it's the "typical" middle value, `Tag` for frequency since
 * it's fundamentally a specials-frequency stat). Icon + tint pairs are
 * looked up by `insight.key` in `TILE_STYLE` rather than threaded through
 * `PriceHistoryInsight` itself (packages/shared/src/deal-detail.ts) --
 * presentation-only concerns (a color, an icon component) that only this
 * one rendering of the data cares about, kept local to this file rather
 * than leaking into the shared data-shape package other consumers of
 * `buildPriceHistoryInsights` would also have to carry.
 *
 * Tints deliberately overridden again, same day, per Jay's own follow-up
 * naming specific colors per tile: "90 day high tile can be a subtle red,
 * with a red arrow. the 90 day low tile should be green. 90 day average
 * tile should be blue." This directly supersedes this file's own "stay
 * away from reds" reasoning above for the HIGH tile specifically -- Jay
 * asking for red there, by name, in the very next message, is about as
 * explicit an override as a standing style note can get; not treated as a
 * conflict to flag, just the newer instruction winning. Colors pulled from
 * this app's own existing design tokens rather than raw Tailwind red/green
 * where one already exists for the concept: `fair-*` (green, this app's
 * own "good deal" token, already used for the price-ranking "Best" badge
 * and cheapest-price text elsewhere on this same page) for low, `alert-*`
 * (this app's own red, already contrast-checked to AA -- see this file's
 * own `alert-600` note in globals.css -- and already used for the
 * "Pricier" chart legend) for high. No existing custom token reads as
 * plain "blue" (`ink-*` is this app's near-black/charcoal scale, not
 * blue, despite naming), so `avg` uses Tailwind's own `blue-*` directly --
 * the one tile here without a pre-existing brand token to reach for.
 * `frequency` was not named in Jay's 3, so its tint is untouched from the
 * first pass (emerald) -- flagged rather than guessed into a 4th color,
 * since two tiles both reading "green" (low + frequency) is a plausible
 * outcome of "he only named 3," not obviously a mistake to silently fix.
 *
 * Frequency tile's two lines swapped and restyled, same day (later
 * follow-up): was `value` ("Rare special", the big headline) on top and
 * `detail` ("5 times in 90 days", small stone-500 caption) below -- per
 * Jay: "swap these texts around, so Rare special is at the bottom. Make
 * the '5 times in 90 days' text, the same as the '90-day average' text
 * (same font and bold)." "90-day average" is the AVG tile's own `label`
 * line (`text-sm font-black tracking-wide text-stone-500`) -- `detail` now
 * renders in that exact same slot/style for the frequency tile specifically
 * (frequency's own `label` is still `""` and stays hidden, unchanged from
 * the 2026-08-21 "simplify the 4th tile" pass above), with `value`
 * underneath it keeping its existing headline treatment. Net effect: this
 * tile's layout now matches the other 3 (small bold caption on top, bigger
 * headline below) using `detail`'s text in the caption slot instead of an
 * empty `label`, rather than the old headline-then-caption shape unique to
 * this one tile. The standalone bottom `insight.detail` paragraph this file
 * used to render (10px, later 14px, `line-clamp-2`/`max-w-[140px]` to guard
 * against overflow) is gone now that `detail` has moved up into the label
 * slot -- no `max-w`/`line-clamp` carried over, matching how the other 3
 * tiles' own `label` line has never needed either (Jay's ask was for
 * literal parity with that line, not a variant of it).
 */
const TILE_STYLE: Record<
  PriceHistoryInsight["key"],
  { icon: typeof ArrowDown; tint: string; iconColor: string }
> = {
  low: { icon: ArrowDown, tint: "bg-fair-50", iconColor: "text-fair-600" },
  high: { icon: ArrowUp, tint: "bg-alert-50", iconColor: "text-alert-600" },
  avg: { icon: Equal, tint: "bg-blue-50", iconColor: "text-blue-600" },
  frequency: { icon: Tag, tint: "bg-emerald-50", iconColor: "text-emerald-600" },
};

function getPriceTipsStatement(verdict: AssessmentVerdict, frequency: string): string {
  if (isUncertainAssessment(verdict)) {
    return verdict === "Early read"
      ? "This is an early flag based on older prices. More recent checks will help confirm it."
      : "We don’t have enough regular prices yet to make a reliable comparison.";
  }

  const isRare = frequency === "Rare special";
  const isFrequent = frequency === "Frequent special";
  const isNever = frequency === "Never on special";

  if (verdict === "Real Saver") {
    if (isRare) return "This is a true deal, it's genuinely a cheaper special that doesn't happen often.";
    if (isFrequent) return "This is a genuine deal, but it comes around often, so a similar special may come again.";
    if (isNever) return "This is a true deal, as this item is not often available on special.";
    return "This is a genuine deal, with a cheaper price than usual.";
  }

  if (verdict === "Dodgy Deal") {
    if (isFrequent) return "Not a good deal, it's dodgy. Wait until it goes on special again.";
    if (isNever) return "Not a good deal, it's dodgy. Wait until the price drops.";
    return "Not a good deal, it's dodgy. Wait for a better special.";
  }

  if (isFrequent) return "Maybe hold off, this deal is ok but could be cheaper in the future, as it's frequently on special.";
  if (isNever) return "This is a fair price, but it isn't currently showing a regular special pattern.";
  return "This deal is fair, but it may be worth waiting if you don't need it today.";
}

export default function PriceHistoryInsightCard({
  insights,
  verdict,
}: {
  insights: PriceHistoryInsight[];
  verdict: AssessmentVerdict;
}) {
  const frequency = insights.find((insight) => insight.key === "frequency")?.value ?? "";

  return (
    <div className="space-y-3">
      {/* Title added 2026-08-20, per Jay's ask ("add a title inside it above
          the grid"). "90-Day" hyphenated/capitalized to match the existing
          "90-Day Low"/"90-Day High"/"90-Day Average" cell labels below and
          this page's own "Price History Insights" heading style, rather
          than Jay's own lowercase "90 day price tips" phrasing verbatim --
          flagged, not silently kept as typed, since every other heading on
          this page/card already follows this exact convention. Kept Title
          Case even after the same-day "tile titles should be sentence case"
          ask below -- read that ask as being about the 4 small per-tile
          labels specifically (each literally a "tile" in the grid, plural
          "titles"), not this card-level heading, which matches "Price
          History Insights" above it stylistically either way. */}
      <h4 className="dd-type-section text-stone-900">90-Day Price Tips</h4>
      <p className="dd-type-secondary text-stone-600">
        <AssessmentText text={getPriceTipsStatement(verdict, frequency)} />
      </p>
      <div className="grid h-56 w-full grid-cols-2 grid-rows-2 divide-x divide-y divide-stone-100 rounded-xl border border-stone-100">
        {insights.map((insight) => {
          const tile = TILE_STYLE[insight.key];
          const Icon = tile.icon;
          return (
            <div
              key={insight.key}
              className={`flex flex-col items-center justify-center gap-1 p-3 text-center ${tile.tint}`}
            >
              <Icon className={`h-5 w-5 ${tile.iconColor}`} strokeWidth={2.5} aria-hidden="true" />
              {/* Caption slot: `insight.label` for low/high/avg ("90-day
                  low"/"90-day high"/"90-day average"), or `insight.detail`
                  for frequency ("X times in Y days") -- swapped into this
                  same slot/style 2026-08-21 (see this file's header comment)
                  so the frequency tile reads caption-then-headline like
                  every other tile, instead of its old headline-then-caption
                  shape. Frequency's own `label` stays `""`/hidden either
                  way (unchanged since the "simplify the 4th tile" pass). */}
              {insight.key === "frequency"
                ? insight.detail && (
                    <p className="dd-type-meta text-stone-500">{insight.detail}</p>
                  )
                : insight.label && <p className="dd-type-meta text-stone-500">{insight.label}</p>}
              {/* text-lg (18px) -> text-base (16px), 2026-08-21, scoped to
                  JUST the frequency tile (see this file's header comment) --
                  every other tile's `value` is a short $ amount and stays
                  text-lg. */}
              <p
                className={`font-display leading-tight font-extrabold text-stone-900 ${
                  insight.key === "frequency" ? "text-base" : "text-lg"
                }`}
              >
                {insight.value}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
