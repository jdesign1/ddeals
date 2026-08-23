"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useSearch } from "@/lib/search-context";

type MaterialSymbolName = "check_circle" | "list_alt_add" | "search_check_2" | "leaderboard";

/**
 * Bottom nav: Check deals / Lists / All Checks / Deal stats. First tab's
 * label changed from "Home" to "Check deals" 2026-08-11, per Jay's ask, to
 * match the prototype's own bottom nav label for this slot (see line below).
 * Active-tab styling changed same day, also per Jay's ask ("too light" /
 * "make it dark when selected"): was `--color-brand-primary` (green) text
 * only, now a dark (`--color-ink-900`) pill (`bg-ink-900`) behind the icon
 * (icon turns white inside it) plus dark label text (weight unchanged,
 * still `font-medium` on the whole tab either way). Uses the
 * ported-from-prototype `ink-*` tokens (globals.css) rather than the Stitch
 * brand green, since a solid dark pill read better than a green one here.
 *
 * Active-tab fill went through two revisions same day (2026-08-13), both
 * per Jay's ask. First: widened the `bg-ink-900`/white-icon pill (which
 * used to wrap only the icon, `h-8 w-14`, with the label sitting outside
 * it as plain dark text) to wrap icon+label together as one `rounded-full`
 * capsule, both turning `#ffffff` inside it. Then, same day: Jay asked for
 * the fill on the whole flex-1 cell instead, square corners, so every tab
 * is the same width/shape when selected -- a pill sized to its own label
 * width made "Lists" narrower than "Check deals," which read as
 * inconsistent. `bg-ink-900` now lives directly on the outer `Link`
 * (`flex-1`, `items-stretch` from the parent `<nav>` makes it fill the
 * tab's full column, edge to edge with its neighbors) with no
 * `rounded-full`; the inner `<span>` is just an icon+label layout wrapper
 * now, no background/radius of its own. `#6b6b6b` inactive color
 * unchanged, not part of either revision. Padding math (outer `py-1.5` +
 * inner `py-2.5` + `h-5` icon + `gap-1` + `text-[12px] leading-4` label line) still
 * totals 72px/4.5rem -- the exact height `layout.tsx`'s own comment says
 * its scroll-container bottom padding assumes this component renders at,
 * unaffected by either revision since neither touched those values.
 *
 * Originally Home /
 * Lists / Specials / Me per the Stitch screen inventory (project.md,
 * "Stitch UI Design — Screen Inventory"), with Specials (S8) in the third
 * slot and a plain "Me" label on the fourth. Swapped 2026-08-11, per Jay's
 * ask to match the prototype's own bottom nav (Check deals / My List / All
 * Checks / Deal stats) more closely, now that both "All Checks" (`/history`)
 * and "Deal Stats" (`/me`'s real content) are real screens here too
 * (2026-08-11 session above), not just a placeholder/a link from it. Route
 * for the fourth tab stays `/me` -- only the label/icon changed, matching
 * the prototype's own label for that exact route's content, not a new
 * route. Icons (`History`, `BarChart3`) matched the prototype's own
 * bottom-nav icons for these two tabs (`Prototype/index.html` lines
 * ~7291/~7304) at the time -- since replaced (2026-08-13, see below).
 *
 * All four tab icons use the exact Google Material Symbols glyphs now:
 * `check_circle`, `list_alt_add`, `search_check_2`, and `leaderboard`.
 * Each glyph uses FILL 0 for the default state and FILL 1 for the selected
 * state, matching the icon references supplied by Jay.
 *
 * Container reshaped into a floating rounded pill 2026-08-13, per Jay:
 * "make the bottom nav bar appear as a long pill with rounded corners" --
 * was a full-bleed bar flush with all 3 screen edges (`inset-x-0 bottom-0`,
 * no radius). Now inset from the edges (`inset-x-4`, floating off the
 * bottom edge via a `bottom` offset instead of sitting flush against it)
 * with `rounded-full` + `overflow-hidden` on the outer `<nav>`.
 *
 * IMPORTANT for future edits to this file (and any other file in this
 * app): never write an actual Tailwind utility prefix directly against an
 * opening square bracket in a comment (a real utility name like "bottom"
 * or "pb" immediately followed by an arbitrary-value bracket), not even
 * as a shorthand example, not even inside backticks. Tailwind's class
 * scanner treats every source file as plain text and can't tell a real
 * class in JSX apart from the same-looking string sitting in a comment --
 * a shorthand "..." placeholder written that way here once got picked up
 * as a real candidate class and failed to compile (the placeholder wasn't
 * valid CSS), breaking the whole app's build. Describe classes in prose
 * instead, as below.
 *
 * The nav's positioning classes offset it 1 CSS rem down from the top of
 * its own bottom margin and inset it a matching amount from the safe-area
 * inset at the bottom of the screen, using underscores in place of spaces
 * around the calc() operators (Tailwind's own convention for arbitrary
 * values) -- not load-bearing for this app's build, since Tailwind
 * normalizes calc() spacing itself when it compiles an arbitrary-value
 * class into real CSS (confirmed by the fact the pre-existing unspaced
 * equivalent padding classes elsewhere in the app -- `FullScreenSearch.tsx`,
 * `AppHeader.tsx`, `app/page.tsx` -- already compile to correctly-spaced
 * CSS today), but kept anyway since it's the documented Tailwind
 * convention and makes no difference either way once compiled.
 *
 * The `overflow-hidden` does double duty: it's what actually makes this read as
 * one continuous pill instead of a rounded-corner rectangle with square
 * tabs poking out, AND it means the active tab's own fill (`bg-ink-900`,
 * still a plain square-cornered `flex-1` cell per the square-corners
 * decision above -- unchanged) gets automatically corner-clipped to match
 * the pill's curve on whichever end tab (first or last) happens to be
 * active, with no extra per-tab corner-radius logic needed. `shadow-lg
 * shadow-black/10` added since a floating pill with nothing under it reads
 * as visually adrift without one -- the old edge-to-edge bar never needed
 * this, it had the screen edge itself as a visual anchor. `layout.tsx`'s
 * matching scroll-container bottom padding was widened accordingly (see
 * that file's own comment) to clear the pill's new total footprint
 * (height + bottom margin + safe-area), not just its height.
 *
 * `/specials` (S8) still exists as a real route and still has a real
 * Stitch mockup behind it — it's just no longer linked from anywhere in
 * the app's own UI now that this slot points at `/history` instead (a
 * plain grep of `apps/mobile/src` confirms `BottomNav.tsx` was the only
 * in-app link to it). Flagged rather than silently orphaned: worth a
 * deliberate call on whether that's fine (its own functionality --
 * store-filterable specials grid -- overlaps a fair bit with the
 * full-screen search overlay's own "Popular specials"/"Dodgy" browse view)
 * or whether it needs linking back in from somewhere, e.g. Home.
 *
 * `fixed` instead of `sticky` (2026-08-12) -- the translucent/blurred fill
 * (`bg-white/80 backdrop-blur-md`, added in an earlier, undocumented
 * change Jay made directly) had nothing behind it to actually blur: this
 * nav used to be a normal flex sibling of the scrollable content area in
 * `layout.tsx` (its own row, reserving space below that container), so
 * page content never scrolled underneath it -- a translucent+blurred
 * layer over a flat, unchanging background looks identical to a plain
 * flat color, which is exactly why Jay reported "I can't see this
 * effect." Switched to `fixed bottom-0`, so it now overlays the content
 * instead of pushing it up -- content genuinely scrolls behind it,
 * giving the blur something to do (the real iOS-tab-bar "liquid glass"
 * look). `layout.tsx`'s scroll container got matching bottom padding so
 * real content still clears the nav at rest. `mx-auto w-full
 * max-w-[480px]` locks it to the same mobile-emulation column every
 * other `fixed`, full-viewport-by-default element in this app already
 * needs (same fix already applied to `FullScreenSearch.tsx`'s overlay
 * and category-sheet scrim, 2026-08-12 session above) -- without it, a
 * plain `fixed inset-x-0` would stretch edge-to-edge across the real
 * browser viewport on any window wider than 480px, not just up to the
 * app's own capped column.
 *
 * Update (2026-08-14): the calc()-plus-safe-area-inset bottom-offset class
 * below moved to `.bottom-safe-nav` in globals.css -- same Tailwind
 * v4.3.3/oxide candidate-scanner bug as `layout.tsx`'s matching padding
 * class (see that file's own comment), just on the actual `className` this
 * time rather than a comment placeholder. Plain CSS isn't scanned, so it
 * isn't exposed to the bug.
 *
 * Hidden entirely on the deal-assessment page (2026-08-17, per Jay: "Remove
 * the bottom nav bar from deal assessment pages") -- `pathname.startsWith(
 * "/deal/")` returns `null` before the `<nav>` renders at all, reusing the
 * same `usePathname()` call this component already had for its own
 * active-tab highlighting rather than adding a second hook. `layout.tsx`
 * mounts this globally (its own doc comment), so hiding it per-route has to
 * happen in here, not at the mount site. The scroll container's matching
 * `pb-safe-nav` bottom padding (reserved so page content clears this nav's
 * floating footprint) is switched to the smaller `pb-safe-sm` on this same
 * route by a new `ScrollContainer.tsx` client wrapper around `layout.tsx`'s
 * `{children}` -- see that file's own doc comment -- so the deal page isn't
 * left with a dead 5.5rem gap at the bottom now that nothing floats there.
 *
 * Active-tab fill reworked a third time, same day (2026-08-14), per Jay:
 * "Change the bottom nav bar selected states to be a rounded pill around
 * the icon and text, which is the same width across all bottom bar items."
 * The rounded fill lives on the inner `<span>`, while each tab remains an
 * equal, fluid flex cell. The inner span fills its cell instead of using a
 * hard-coded pixel width, so the four tabs stay equal on narrow iPhones and
 * never force the navigation outside the browser viewport. The icon/label
 * remain stacked vertically, so the longest label still fits within the
 * available cell. Outer `py-1.5` + inner `py-2.5` + icon/label sizing are
 * otherwise unchanged, so the 72px/4.5rem total height math above still holds.
 *
 * Selection pop-in animation added (2026-08-20, same day), per Jay: "when
 * selected, the black pill animates from smaller initially to large to fit
 * the selected state." Every tab's icon+label wrapper (the `<span>` below)
 * renders at the same fluid cell size regardless of active state -- only its
 * `bg-ink-900` fill is conditional (see the doc-comment history above) -- so
 * the fill itself, not the layout box around it, is what needed to animate.
 *
 * Split the fill into its own `motion.span`, absolutely positioned
 * (`absolute inset-0`) behind the icon+label content, mounted/unmounted via
 * `AnimatePresence` on `isActive` rather than toggled by a class the way
 * the plain `bg-ink-900` conditional did before -- Motion only animates a
 * value change on an element that's already mounted (or an
 * enter/exit transition on one that's mounting/unmounting via
 * `AnimatePresence`); a `className` flipping a background color with no
 * scale value to interpolate wouldn't animate a size change at all. The
 * outer `<span>` picked up `relative` (stacking context for the pill's
 * `absolute` positioning) and the icon/`{label}` are otherwise untouched;
 * the fill motion span uses `zIndex: -1` so it paints behind them despite
 * being `position: absolute` (an absolutely positioned element with
 * `z-index: auto` would otherwise paint above its non-positioned in-flow
 * siblings by default, covering the icon/label).
 *
 * `initial={{ scale: 0.5, opacity: 0 }}` -> `animate={{ scale: 1, opacity:
 * 1 }}` is the "smaller initially to large" Jay asked for -- a spring
 * (`stiffness: 500, damping: 30`), not a linear/eased tween, so it lands
 * with a touch of the same bouncy settle Motion's other pop-in moments in
 * this app already use (`AddToListButton`'s checkmark, `ScannerModal`'s
 * open transition) rather than a flat linear grow. `exit={{ scale: 0.5,
 * opacity: 0 }}` shrinks the fill back out symmetrically when a tab
 * deactivates -- not explicitly asked for, but the obvious counterpart to
 * "animates in," and without it the previous tab's fill would just vanish
 * instantly on the same tap that grows the new one in, an visibly
 * asymmetric, unfinished-looking pairing.
 *
 * Icon/label color is still a plain CSS `transition-colors` (unchanged,
 * not moved onto Motion) -- it's a color interpolation on elements that
 * stay mounted the whole time, exactly what CSS transitions already handle
 * well; only the fill needed Motion's mount/unmount + scale/opacity
 * choreography.
 */
const TABS: {
  href: string;
  label: string;
  icon: MaterialSymbolName;
}[] = [
  // Icon swapped `Home` -> `Search` 2026-08-19, per Jay: "change home icon
  // to search icon" -- label/href/active-tab logic untouched, this tab
  // still points at `/` and is still highlighted there; only the glyph
  // changed. Doesn't reopen the "no search entry point on /specials, /lists,
  // /me" gap this file's own header comment already flags (this is still
  // just a Home-tab icon, not a functioning search trigger on its own --
  // the real full-screen search overlay is still only reachable via Home's
  // own inline search bar / AppHeader's global icon, per that comment).
  { href: "/", label: "Check deals", icon: "check_circle" },
  { href: "/lists", label: "Lists", icon: "list_alt_add" },
  { href: "/history", label: "All Checks", icon: "search_check_2" },
  { href: "/me", label: "Deal stats", icon: "leaderboard" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { isActive: isSearchActive, closeSearch } = useSearch();

  if (pathname.startsWith("/deal/")) return null;

  return (
    <nav
      className="fixed inset-x-3 bottom-safe-nav z-40 mx-auto flex w-auto max-w-[456px] items-stretch justify-around overflow-hidden rounded-full bg-white/80 backdrop-blur-md shadow-lg shadow-black/10"
      style={{ zIndex: isSearchActive ? 55 : undefined }}
    >
      {TABS.map(({ href, label, icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (isSearchActive) closeSearch();
            }}
            className="flex min-w-0 flex-1 items-center justify-center py-1.5"
          >
            <span
              className="bottom-nav-tab relative flex w-full min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-full px-0 py-2.5 text-[12px] leading-4 font-medium transition-colors"
              style={{ color: isActive ? "#ffffff" : "#57534e" }}
            >
              {/* initial={false} (2026-08-20, per Jay: "don't animate the
                  tabs into view [on load] ... animation only occurs when
                  users select the tab") -- see home-page.tsx's own version
                  of this comment for the full reasoning. Matters here even
                  more than most: this is a route-driven active state (which
                  pill is "active" depends on the current URL), so on a cold
                  page load/refresh the pill for whatever route you landed
                  on would otherwise pop in every single time, not just on a
                  real tap. */}
              <AnimatePresence initial={false}>
                {isActive && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-ink-900"
                    style={{ zIndex: -1 }}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </AnimatePresence>
              <span
                className="material-symbols-outlined h-5 w-5 text-[24px]"
                style={{
                  color: isActive ? "#ffffff" : "#57534e",
                  fontVariationSettings: `'FILL' ${isActive ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
                }}
                aria-hidden="true"
              >
                {icon}
              </span>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
