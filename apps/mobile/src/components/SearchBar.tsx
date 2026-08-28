"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSearch } from "@/lib/search-context";
import { subscribeToCheckDealsHeaderVisibility } from "@/lib/scroll-events";

/**
 * Global search bar — extracted 2026-08-11 from Home's own inline block
 * (`app/page.tsx`, the "Ported from Prototype/index.html's SearchTab
 * persistent header" block) verbatim (same classes/ids/behaviour), per Jay's
 * ask to put "the search bar from the home screen" at the top of `/lists`,
 * `/history`, and `/me` too — the same three routes `AppHeader.tsx`'s own
 * doc comment already flagged as having no way to reach search after the
 * 2026-08-11 "remove the search icon from the top nav bar" change (that
 * comment's own "follow-up in case that's an oversight" — it was).
 *
 * No props: reads everything from the global `useSearch()` context
 * (lib/search-context.tsx), same as `FullScreenSearch.tsx`/`AppHeader.tsx`
 * already do, so any page can drop this in with zero wiring. Renders `null`
 * while the full-screen overlay is open (`isActive`) — same guard Home's own
 * copy of this block always had, so this doesn't render a second, redundant
 * bar underneath the overlay's own sticky bar.
 *
 * Sticky (`top-0`) against the nearest scrolling ancestor -- on every page
 * that's the `flex-1 overflow-y-auto` wrapper `layout.tsx` puts around
 * `{children}`, the same one Home's own copy already relied on, so it docks
 * directly under the global `AppHeader` (a sibling outside that scroll
 * container, not sticky within it) exactly the way it already did on Home.
 *
 * `/history` keeps its own separate, page-local search input (filters
 * *that page's own already-loaded check-history list* by name/brand) —
 * this is a different, additional control, not a duplicate: this bar opens
 * the same full-catalogue full-screen search overlay every other screen
 * uses, `/history`'s own input never did.
 *
 * `blurred` (2026-08-12, per Jay's ask, Home only) -- originally swapped
 * the sticky wrapper's solid `bg-white` for the same translucent
 * `bg-white/80 backdrop-blur-md` fill `BottomNav.tsx` uses. Changed
 * 2026-08-14, per Jay: "remove the search bar's white blur background, so
 * it has a transparent background" -- dropped `bg-white/80` so Home's page
 * content shows straight through behind this bar instead of through a
 * translucent white layer, briefly leaving `backdrop-blur-md` off too
 * (fully transparent, no blur at all). Jay's very next ask, same day: "add
 * a background blur to the transparent search bar background" -- put
 * `backdrop-blur-md` back on its own, with no `bg-white/80` alongside it
 * this time, so scrolling content blurs as it passes underneath while the
 * bar itself still has no visible fill/tint of its own. Defaults to
 * `false` (opaque `bg-white`, unchanged) since Jay scoped this to Home
 * specifically, not every page this component renders on --
 * `/lists`/`/history`/`/me` still render a plain solid bar, not touched by
 * either ask. The prop name `blurred` reads accurately again now that its
 * `true` branch genuinely does apply a blur, just without the white tint
 * that name originally implied alongside it.
 *
 * Fades out on exit now (2026-08-12, per Jay's ask to make the transition
 * into full-screen search smoother) instead of vanishing the instant
 * `isSearchActive` flips true -- previously this returned `null` outright
 * (an instant unmount/"pop"), while `FullScreenSearch.tsx`'s own overlay
 * faded in over 200ms on top of it, so the docked bar visibly popped away
 * a beat before the overlay had caught up, rather than the two crossfading
 * together. `AnimatePresence` + a matching 200ms/`easeOut` exit fade (same
 * duration/easing as that overlay's own `initial`/`animate`/`exit`) makes
 * this bar fade out in sync with the overlay fading in instead. `initial=
 * {false}` deliberately skips animating the ENTRANCE, though -- this
 * component mounts fresh on every route navigation (each page renders its
 * own `<SearchBar />`, it isn't layout-level/persisted like `AppHeader`),
 * so animating every single page load/nav would be a much bigger,
 * unrelated behavior change outside what Jay actually asked about
 * (specifically "selecting the search bar" -- the exit only).
 *
 * Scan-barcode trailing button removed 2026-08-14 (Jay: "remove the scan
 * barcode icon from all search bars - we can't do this right now"), same
 * day and same ask as the matching removals in `FullScreenSearch.tsx` and
 * the deal-assessment page's own search-prompt replica -- between the
 * three, that was every scan-barcode entry point this app's search UI had
 * (the one remaining `ScanBarcode` icon left in the codebase, on
 * `/specials`, is a decorative header icon with no click handler, not a
 * search bar -- untouched, out of scope). `openScanner`/`ScannerModal`
 * themselves are untouched code, just with no trigger left anywhere in the
 * app to reach them now.
 *
 * Clear control swapped from a text "Clear" button to a plain X icon
 * (2026-08-14, Jay: "When typing in the search bar, add an X icon to
 * clear, remove the words 'clear'") -- same trailing position/tap target,
 * same `id`/`aria-label`/click handler, just an icon (`lucide-react`'s
 * `X`, matching every other "close/dismiss" control in this app --
 * `AppHeader.tsx`'s sheet, `lists/page.tsx`'s sheet, `AddToListButton.tsx`'s
 * sheet all already use the same icon for the same idea) instead of
 * uppercase tracking-widest text. `aria-label`/`title` still say "Clear
 * search" even though the visible label is gone, so this stays reachable
 * by name for screen readers.
 *
 * `placeholder` (2026-08-15, My List page changes) -- was a hardcoded
 * "Search if today's deals are dodgy" string, fine for Home (where it's
 * literally true) but wrong copy on `/lists`, where Jay wants "Search
 * items to add to your lists" instead. Now a prop with the original copy
 * as its default, so Home/`/history`/`/me` (none of which asked for
 * different copy) render unchanged.
 *
 * `variant="shadow"` (2026-08-15, same session, My List page only) --
 * Jay: "Make the search bar background fill the same page colour grey.
 * Make the search bar fill white and give it a subtle drop shadow also."
 * Previously this bar and the sticky wrapper around it were both solid
 * `bg-white`, with a `border-stone-300` outline on the pill itself, so the
 * whole thing read as one seamless white block sitting on top of the
 * page's own `bg-stone-50` fill (globals.css). The new variant flips
 * that: the sticky wrapper drops to `bg-stone-50` (blends into the page
 * instead of covering it) and the pill itself trades its border for a
 * `shadow-sm`, so it now reads as a white card floating over the grey
 * page rather than a border outline sitting inside a white strip. Scoped
 * to a variant (not the default) the same way `blurred` was scoped to
 * Home only above -- Jay's ask was specifically about My List, and
 * `/history`/`/me` weren't asked to change. `blurred` and `variant`
 * are independent (a page could in principle want both), though today
 * only Home uses `blurred` and only `/lists` uses `variant="shadow"`.
 *
 * Focus border + universal shadow (2026-08-17, per Jay: "Change the search
 * bar focus state to have a black border when active" and "Give the Search
 * bar a tight drop shadow matching the product cards") -- two changes to
 * the pill's own classes:
 *  1. The `focus-within:ring-2 focus-within:ring-ink-200` glow (a soft
 *     brand-tinted outer ring, same idea as `AppHeader.tsx`'s sheet inputs)
 *     is replaced with `focus-within:border-black` -- a solid black border
 *     on the pill itself when focused, not a ring around it. The base
 *     `border` utility now always applies (previously only the default
 *     variant had a real border; `variant="shadow"` had none at all) so
 *     there's a border to recolor on focus either way -- `border-transparent`
 *     at rest for `variant="shadow"` keeps that variant's already-invisible
 *     resting border invisible, `border-stone-300` at rest for the default
 *     variant is unchanged from before.
 *  2. `shadow-sm` -- the same tight shadow `DealCard.tsx`/
 *     `ProductListCard.tsx` use on their cards (2026-08-15, "the same tight
 *     drop shadow used on the Lists page saved lists cards") -- now applies
 *     unconditionally instead of only under `variant="shadow"`, so the
 *     default-variant bar (Home/`/history`/`/me`) picks it up too, on top
 *     of (not instead of) its existing `border-stone-300` outline. Not
 *     scoped to a new variant since Jay's ask wasn't page-specific this
 *     time, unlike `blurred`/`variant` above.
 *
 * Focus border lightened (2026-08-17, same day, per Jay: "it should show a
 * black border active state (slightly lighter border line)") --
 * `focus-within:border-black` swapped for `focus-within:border-stone-900`.
 * Grepped the whole `apps/mobile/src` tree first: literal `black`/
 * `border-black` didn't appear anywhere else in this app -- every other
 * "near-black" surface (headings, prices, this same file's own `X` icon
 * hover state) already uses `stone-900`, not the raw Tailwind `black`
 * keyword. `stone-900` (`#1c1917`) is visibly softer than pure `#000000`
 * while still reading as black, so this both satisfies "slightly lighter"
 * and brings the focus border in line with how "black" is expressed
 * everywhere else in this app, rather than being the one spot using a
 * different, harsher black.
 *
 * `sticky` (2026-08-21, per Jay: "The search bar on My Lists page does not
 * need to be sticky") -- `sticky top-0 z-20` used to be unconditional, same
 * as this file's own header comment already describes ("Sticky (`top-0`)
 * against the nearest scrolling ancestor... exactly the way it already did
 * on Home"). Added as a prop, default `true`, so Home/`/history`/`/me`
 * (none of which asked for this) keep docking under `AppHeader` on scroll,
 * unchanged; `/lists` now passes `sticky={false}` on all 3 of its own call
 * sites (loading/signed-out/real-content branches) so the bar just scrolls
 * away with the rest of that page's content instead. Same scoping pattern
 * `blurred`/`variant`/`placeholder` above already established for a
 * My-List-only or Home-only behavior change, not a new one.
 */
export default function SearchBar({
  blurred = false,
  variant = "default",
  bordered = false,
  backgroundClassName,
  placeholder = "Search if today's deals are dodgy",
  sticky = true,
  topSpacing = false,
}: {
  blurred?: boolean;
  variant?: "default" | "shadow";
  bordered?: boolean;
  backgroundClassName?: string;
  placeholder?: string;
  sticky?: boolean;
  topSpacing?: boolean;
}) {
  const { query: searchInput, setQuery: setSearchInput, isActive: isSearchActive, openSearch } = useSearch();
  const pathname = usePathname();
  const [isCheckDealsHeaderHidden, setIsCheckDealsHeaderHidden] = useState(false);

  useEffect(() => {
    if (pathname !== "/") return;
    return subscribeToCheckDealsHeaderVisibility(setIsCheckDealsHeaderHidden);
  }, [pathname]);

  // Check Deals has two sticky siblings: AppHeader and this search bar. When
  // the header returns while scrolling upward, dock the search bar beneath
  // the 64px nav instead of letting both sticky elements claim top: 0. Once
  // the header slides away, the search bar returns to the top of the viewport.
  const stickyPositionClass = sticky
    ? `sticky z-20 ${pathname === "/" && !isCheckDealsHeaderHidden ? "top-16" : "top-0"} ${pathname === "/" ? "transition-[top] duration-300 ease-out" : ""}`
    : "";

  return (
    <AnimatePresence>
      {!isSearchActive && (
        <motion.div
          initial={false}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`${stickyPositionClass} px-5 ${topSpacing ? "pb-2 pt-4" : "py-2"} ${
            blurred
              ? "backdrop-blur-md"
              : backgroundClassName || (variant === "shadow" ? "bg-stone-50" : "bg-white")
          }`}
        >
          {/* `pr-2` -> `pr-3` + clear-`X` `h-4 w-4` -> `h-5 w-5`, 2026-08-20,
              mirrors the identical fix in `FullScreenSearch.tsx`'s own real
              typing input (that file's own doc comment has the full "why" --
              Jay's ask, "The X icon in the search bar when typing, should be
              larger, and not so close to the right edge") -- this component
              actually unmounts the instant a query exists (see this file's
              own header comment, "Renders null while the full-screen overlay
              is open"), so its own `X` is barely ever visible mid-type, but
              it's the same shared pill pattern the two files deliberately
              keep in sync (this file's own 2026-08-17 comment above already
              flags them as matching "exactly"), so left out-of-sync here
              would just be the next drift waiting to be caught. */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className={`flex items-center rounded-full border bg-white py-2.5 pl-5 pr-3 transition-colors focus-within:border-stone-900 ${
              bordered
                ? "border-stone-300 shadow-none"
                : variant === "shadow"
                  ? "border-transparent shadow-sm"
                  : "border-stone-300 shadow-sm"
            }`}
          >
            <span
              className="material-symbols-outlined mr-3 flex-shrink-0 text-[22px] text-stone-500"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              aria-hidden="true"
            >
              search
            </span>
            <input
              id="search-input"
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                setSearchInput(value);
                if (value.length > 0) openSearch();
              }}
              onFocus={openSearch}
              placeholder={placeholder}
              className="mobile-zoom-safe-input h-10 w-full border-none bg-transparent font-sans text-sm font-medium text-stone-600 placeholder:text-stone-600 focus:outline-none"
              enterKeyHint="search"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                id="clear-search-btn"
                title="Clear search"
                aria-label="Clear search"
                type="button"
                className="flex-shrink-0 cursor-pointer rounded-full p-1.5 text-stone-400 transition-colors hover:bg-ink-100 hover:text-ink-600"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
