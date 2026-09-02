"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import AuthPanel from "@/components/AuthPanel";

/**
 * Global log-in/sign-up bottom sheet (2026-08-19, per Jay: "The login/sign
 * up screen needs it's own dedicated bottom sheet, and not live on the
 * Lists page"). Before this, `AuthPanel` was rendered as the ENTIRE page
 * content on /lists, /me, /history, and /account whenever `!user` -- a
 * signed-out visit to any of those routes showed nothing else at all, not
 * even the page's own header/search bar in most cases. Now each of those 4
 * pages shows a real empty state (dashed-card, same pattern `page.tsx`'s
 * signed-out `MyListSection` already used) with a "Log in" button that
 * calls `openAuthSheet(prompt)` (see auth-context.tsx's own doc comment
 * for exactly where that state lives), and this sheet is what actually
 * opens.
 *
 * Mounted once, globally, in `GlobalOverlays.tsx` -- same scrim +
 * slide-up-panel pattern `ScannerModal.tsx` established (motion/
 * AnimatePresence, spring transition, rounded-t-3xl, `z-[70]`/`z-[71]`
 * stacking), reused verbatim rather than reinvented, so this reads as the
 * same "kind" of sheet as the scanner and the deal page's own cheaper-
 * alternatives sheet, not a fourth slightly-different pattern.
 *
 * `AuthPanel`'s `onSuccess` now closes this sheet instead of navigating to
 * Home (`router.push("/")`, which `AuthPanel` used to do on every
 * successful sign-in/sign-up) -- that redirect only ever made sense when
 * `AuthPanel` WAS the whole page (there was nothing else to show once
 * signed in, so jumping to Home was the only way to land somewhere real).
 * As a sheet, closing it is enough: the page underneath re-renders on its
 * own the instant `user` becomes non-null (same `useAuth()` value every
 * gated page already reads), showing its own real content in place --
 * tapping "Log in" from /history and landing back on /history with your
 * actual check history, not getting yanked to Home, is the whole point of
 * making this a sheet instead of a page swap.
 *
 * Header `border-b` and tab-track `border-b` both removed 2026-08-20 (per
 * Jay: "login create account bottom sheet - remove the border lines above
 * and below the tabs component") -- these were the header row's own
 * `border-b border-stone-200` (the line directly ABOVE the tab track) and
 * the tab-track wrapper's own `border-b border-stone-200` (the line
 * directly BELOW it, between the tabs and this sheet's scrollable content).
 * Deliberately NOT touched at the time: the tab-pill's own `rounded-xl
 * border border-stone-200` a few lines below that -- that was the segmented
 * control's own full outline around itself, not a horizontal divider
 * bracketing the tabs section, so it was a different line than the two Jay
 * asked to remove that day.
 *
 * UPDATE 2026-08-21: that tab-pill outline IS now gone too, per Jay's
 * broader same-day ask ("Update the pills and tabs to have no border lines,
 * and short tight drop shadows instead") -- see the tab track's own doc
 * comment further below for the `shadow-sm` swap. The distinction drawn
 * above (divider line vs. segmented-control outline) no longer matters
 * since this newer ask covers both.
 *
 * `mode` (Login/Create account) now lives HERE, not inside `AuthPanel`
 * (2026-08-19, per Jay: "Add top tabs Login / Create account - which tab
 * between the two states") -- this sheet renders a segmented tab track
 * (same `bg-stone-900`/white-text-on-active pattern `FullScreenSearch.tsx`'s
 * own Dodgy/All specials tab track already uses) directly below the header,
 * and passes `mode`/`setMode` down to `AuthPanel` as controlled props
 * instead of letting it own that state locally. Two things needed `mode` to
 * live at this level rather than staying inside `AuthPanel`: the header's
 * own icon/title now switches between "Log in" and "Create account" in step
 * with the selected tab (previously always a static "Log in", regardless of
 * which half of the form was showing), and the tabs themselves have to sit
 * in this component's own JSX (between the header and `AuthPanel`), not
 * inside `AuthPanel`'s. Resets to "signin" whenever the sheet closes, so
 * reopening it later (e.g. from a different gated page) doesn't strand a
 * visitor on Create account from a previous, unrelated visit.
 *
 * Height now animates smoothly across that same mode switch (2026-08-19,
 * per Jay: "When toggling between login and create account states, smoothly
 * animated the bottom sheet height difference") -- the sign-up form has 3
 * more fields than sign-in (Name/Age Group/ZIP, `AuthPanel.tsx`), so this
 * panel's own natural height (bounded by `min-h-[45vh]`/`max-h-[92dvh]`
 * below, not a fixed height) genuinely differs between the two tabs; without
 * `layout="size"` on the panel `motion.div` below, that height difference
 * used to just snap instantly on every tab change. `"size"` (not the plain
 * boolean `layout`) restricts Motion's FLIP-based layout animation to width/
 * height only, leaving the entrance/exit `y` slide-up (driven by this same
 * element's own explicit `initial`/`animate`/`exit` keyframes just below)
 * alone -- letting `layout` animate `y` too would fight that keyframe
 * animation for control of the same transform. Both share the one
 * `transition` prop already on this element (the existing spring), so the
 * height settle has the same feel as the slide-up rather than a mismatched
 * second easing curve.
 *
 * Superseded 2026-08-20 (per Jay: "Login tab should have the same height as
 * the create account tab" / "ensure both tabs have the same bottom sheet
 * height, to avoid the size change") -- the paragraph above animated the
 * height DIFFERENCE between tabs; this ask removes that difference instead.
 * `AuthPanel.tsx`'s 4 sign-up-only fields (Name/Select age/NZ ZIP Code/
 * Confirm Password) are now mounted in both modes (`invisible` + `inert` in
 * sign-in, see that file's own doc comment) rather than conditionally
 * unmounted, so this panel's natural height is already the same in both
 * tabs and there's no longer a height delta for `layout="size"` below to
 * animate on an ordinary mode switch. Left in place regardless (not
 * removed) -- it's still doing real work for any height change that ISN'T
 * the mode switch (e.g. a sign-up field's own error message wrapping to a
 * second line), and removing it would bring back an instant-snap for those.
 */
const TABS: { id: "signin" | "signup"; label: string }[] = [
  { id: "signin", label: "Log in" },
  { id: "signup", label: "Create account" },
];

export default function AuthSheet({
  isOpen,
  prompt,
  onClose,
}: {
  isOpen: boolean;
  prompt?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [isViewingLegal, setIsViewingLegal] = useState(false);
  const formScrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Each Login/Create account tab starts at the top of its form. The sheet
  // keeps one scroll container mounted while the controlled form content
  // changes, so without this reset a tab switch inherits the prior tab's
  // scroll offset.
  useLayoutEffect(() => {
    if (formScrollRef.current) formScrollRef.current.scrollTop = 0;
  }, [mode]);

  // Reset to Login whenever the sheet closes -- see this file's own
  // top-of-file doc comment for why this state moved up to this level.
  // Adjusted during render, not a `useEffect` -- same "state that depends
  // on a prop changing" pattern as `AppHeader.tsx`'s own `lastPathname`
  // menu-close logic (see its own comment) and `AuthPanel.tsx`'s matching
  // `lastMode` reset, both for the same reason: avoids tripping
  // `react-hooks/set-state-in-effect`.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setMode("signin");
      setIsViewingLegal(false);
    }
  }

  const title = mode === "signin" ? "Log in" : "Create account";
  const isLegalRoute = pathname === "/privacy" || pathname === "/terms";
  const openLegal = (path: "/privacy" | "/terms") => {
    setIsViewingLegal(true);
    router.push(path);
  };

  // The legal pages are real app routes, but the auth sheet remains mounted
  // and keeps its Create account state. Hiding only the sheet chrome while a
  // legal route is active means that route's existing back arrow can return
  // to the page underneath with this sheet still open.
  if (isOpen && isViewingLegal && isLegalRoute) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="dd-bottom-sheet-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-stone-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          />

          <motion.div
            layout="size"
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="dd-bottom-sheet dd-bottom-sheet-surface dd-auth-sheet fixed bottom-0 left-0 right-0 z-[71] mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border-x border-t border-stone-200 shadow-2xl"
          >
            <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                {/* Mascot mark replaces the LogIn/UserPlus lucide icon here
                    (2026-08-20, per Jay: "Add the dodgy logo man to the top
                    left of the bottom sheet title, to replace the sign in
                    icon") -- same `/logo.svg` mark `AppHeader.tsx`'s own
                    top-left mascot, `LoadingMascot`, and `PageLoader` all
                    already use, static here rather than animated (matching
                    `AppHeader`'s own static usage). Doesn't switch with
                    `mode` the way the old icon did (LogIn vs UserPlus) --
                    it's a fixed brand mark, not a state indicator; `title`
                    just below still switches between "Log in" and "Create
                    account" on its own.
                    Sized up 20px -> 28px (2026-08-20, per Jay: "Increase the
                    size of the dodgy man logo") -- `h-7 w-7`/`width={28}
                    height={28}`, matching `AppHeader.tsx`'s own top-left
                    mascot exactly (`AppHeader.tsx` line ~280) rather than
                    picking an arbitrary new size, since the doc comment
                    right above already claims parity with that mark and
                    20px never actually matched it. */}
                <Image src="/logo.svg" alt="" width={28} height={28} className="theme-logo h-7 w-7 flex-shrink-0" />
                {/* Bottom-sheet title style unified app-wide 2026-08-19 --
                    was a static "Log in", now switches with `mode` and uses
                    the same text-lg/font-black/tracking-tight class every
                    bottom sheet's title uses (see app/page.tsx's Sort sheet
                    for the full cross-reference). */}
                <h3 className="dd-type-sheet-title text-stone-900">{title}</h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Login/Create account tab track -- see this file's own
                top-of-file doc comment. Same segmented-control pattern
                `FullScreenSearch.tsx`'s own Dodgy/All specials tabs use
                (`bg-stone-900`/white text on the active tab, `flex-1` cells
                so both tabs share the track evenly regardless of label
                length).
                Explicit `h-9` on both tab buttons + `items-stretch` on this
                outer track (2026-08-20, per Jay: "Make the login tab the
                same height as the create account tab") -- was `items-center`
                (the default) with each button's height left to its own
                intrinsic content box (`py-2` + one line of text), which
                only guarantees equal height as long as both labels reliably
                wrap to exactly one line each; "Log in" and "Create account"
                are different lengths, sharing the same `flex-1` width, so a
                fixed height guarantees they match regardless of viewport
                width/label length rather than relying on that always
                holding. `flex items-center justify-center` inside each
                button re-centers its label now that height is fixed rather
                than padding-driven; `whitespace-nowrap` added alongside so
                neither label can wrap to a second line and blow out this
                fixed height.

                Active-tab fill animated 2026-08-20, per Jay: "use the same
                effect for when switching tabs in all tab components" -- same
                pop-in as `BottomNav.tsx`/`app/page.tsx`/
                `FullScreenSearch.tsx`'s two tab tracks (their own doc
                comments have the full reasoning), applied verbatim here:
                fill moved off this button's own conditional class into an
                absolutely positioned `motion.span` (`zIndex: -1`, behind the
                label), mounted/unmounted via `AnimatePresence` on `mode ===
                tab.id`, spring scale-in from 0.5, symmetric exit. Text color
                stays a plain CSS `transition-colors`.

                BUG FIX 2026-08-20 (cont.), per Jay: "The tabs should animate
                the black fill into view, currently the selected tab is
                white, and cant be seen" -- the fill above was invisible.
                Root cause: `relative` alone gives the button `position:
                relative` but `z-index: auto`, which does NOT establish a
                CSS stacking context. Per spec, a `position:absolute`
                descendant with a NEGATIVE `z-index` (here `zIndex: -1`,
                needed so the fill paints behind the button's own text node)
                resolves its paint order against the nearest ANCESTOR that
                *does* establish a stacking context -- not necessarily this
                button. Every ancestor up to the bottom-sheet's own `motion.
                div` (`fixed ... z-[71]`, the first real stacking context)
                is `position: static` (Tailwind's default, no positioning
                utility), so the fill escaped all the way up and painted
                behind the entire sheet's background -- i.e. invisible,
                matching Jay's report exactly. Confirmed empirically (not
                just by spec-reading) with an offline Playwright repro:
                same markup with only `relative` on the button rendered the
                sample point as white `rgb(255,255,255)` (wrapper bg
                showing through); adding `z-0` alongside `relative` (below)
                rendered it `rgb(28,25,23)` -- exactly `bg-stone-900`, the
                fill's own color. Fix: add `z-0` to the button so it
                establishes its own local stacking context (`position:
                relative` + explicit `z-index: 0`) -- the negative-z-index
                fill then resolves against THIS button, landing directly
                behind the label as originally intended, without changing
                any layout (0 has no effect on paint order relative to
                unrelated siblings, which are also static/auto). Same fix
                applied to the identical pattern in `FullScreenSearch.tsx`
                (x2), `BottomNav.tsx`, `app/page.tsx` -- see their own doc
                comments. */}
            <div className="flex flex-shrink-0 items-stretch gap-1 bg-stone-50 p-3">
              {/* Track border -> shadow-sm, 2026-08-21, per Jay's
                  pills/tabs/sort/category no-border ask -- see
                  `app/page.tsx`'s Home tab track for the full
                  cross-reference. */}
              <div className="flex flex-1 items-stretch gap-1 rounded-xl bg-white p-1 shadow-sm">
                {TABS.map((tab) => {
                  const isActive = mode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMode(tab.id)}
                      aria-pressed={isActive}
                      className={`relative z-0 flex h-9 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg dd-type-control transition-colors ${
                        isActive ? "dd-auth-tab-active text-white" : "text-stone-600 hover:text-stone-900"
                      }`}
                    >
                      {/* initial={false} (2026-08-20, per Jay: "don't
                          animate the tabs into view [on load] ... animation
                          only occurs when users select the tab") -- see
                          home-page.tsx's own version of this comment.
                          Applies here even though this "load" is the sheet
                          opening rather than a page load: `AuthPanel` (and
                          this tab track with it) unmounts when the sheet
                          closes and remounts fresh each time it opens (see
                          this file's own doc comment on why), so without
                          this the default Login/Create account tab would
                          pop in on every single sheet open, not just a real
                          tap between the two. */}
                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.span
                            className="dd-auth-tab-active-fill absolute inset-0 rounded-lg bg-stone-900 shadow-xs"
                            style={{ zIndex: -1 }}
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          />
                        )}
                      </AnimatePresence>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              ref={formScrollRef}
              className="min-h-0 flex-1 overflow-y-auto p-6"
            >
              <AuthPanel
                prompt={prompt}
                onSuccess={onClose}
                onOpenLegal={openLegal}
                mode={mode}
                onModeChange={setMode}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
