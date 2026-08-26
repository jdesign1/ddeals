"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, X, UserCog, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useHeaderOverride } from "@/lib/header-context";
import { subscribeToCheckDealsHeaderVisibility } from "@/lib/scroll-events";

/**
 * Shared global top nav bar — ported from Prototype/index.html's
 * `AppHeader` (see project.md, "Restyled the prototype to the new 'Dodgy
 * Deal · Mobile UI Kit' design system", 2026-08-04). The prototype renders
 * one `AppHeader` above every tab's content so the profile icon/menu always
 * sits in the same place; this does the same job here, mounted once in
 * `layout.tsx` above `{children}` rather than per-page.
 *
 * Markup/classes (sticky h-16 bar, avatar circle, dropdown menu shape) are
 * copied as closely as this app's actual routes allow. Deliberate
 * differences from the prototype, flagged rather than silently dropped:
 *  - The prototype's menu has "How Dodgy Deal works" / "Manage Account" /
 *    "Store Settings" items navigating to tabs that only exist in the
 *    prototype's own state machine, none of which existed in apps/mobile at
 *    first -- so until 2026-08-12 this menu only offered what was real: log
 *    out (signed in) or a link to /lists (signed out). Since then, per
 *    Jay's ask to "add the profile menu options from the prototype," two of
 *    those three now have real pages here too (`/how-it-works`, `/account`
 *    -- see those files' own doc comments) and are wired into the menu
 *    below. "Store Settings" is deliberately still skipped -- Jay's own
 *    call when asked, since there's no real store-preferences feature in
 *    apps/mobile to link it to. Also unlike the prototype (whose
 *    `isUserMenuOpen && isLoggedIn` outer guard makes its own logged-out
 *    menu branch dead code -- the profile button there opens the login
 *    modal directly, never the menu), this version opens a real menu in
 *    *both* states, since "How Dodgy Deal works" is available either way
 *    and logged-out visitors still need a "Create account / log in" entry
 *    point to `/lists` (sentence case since 2026-08-13, see this file's
 *    own bullet on that below).
 *  - The menu itself renders as a bottom sheet (same day, same batch --
 *    Jay: "selecting the profile menu, should appear as a bottom sheet,
 *    rather than the current drop down menu"), not the small top-right
 *    dropdown card it briefly was for a few hours on 2026-08-12. Same
 *    `AnimatePresence` + spring `y: "100%" -> 0` slide-up recipe every
 *    other bottom sheet in this app uses (`ScannerModal.tsx`, the deal
 *    page's "Cheaper Alternative Options" sheet, `FullScreenSearch.tsx`'s
 *    category sheet), scrim-and-panel both capped at the app's own
 *    `max-w-[480px]` mobile width, `z-50`/`z-[51]` matching the
 *    `ScannerModal.tsx`/deal-page-sheet stacking tier (this menu, like
 *    those two, opens from ordinary page chrome, not from inside another
 *    overlay -- see `PageLoader.tsx`'s own doc comment for the app's full
 *    z-index ordering). Closes via scrim tap, an explicit X button in the
 *    sheet's own header, or picking a menu item -- the old dropdown's
 *    click-outside-the-card `mousedown` listener is gone, since a
 *    full-viewport scrim already covers every "outside" click the old
 *    listener existed to catch.
 *  - Same day, one more fix: Jay noticed the new sheet was rendering
 *    *underneath* `BottomNav` on Home ("bottom sheet should appear over
 *    the bottom nav bar"). The sticky shell is raised to `z-[45]` (above
 *    `BottomNav`'s `z-40` and below the app's `z-50` overlay tier), while
 *    the sheet and scrim render outside that shell at their own `z-50` /
 *    `z-[51]` values. They must remain outside the shell because the shell
 *    also uses `overflow: hidden` to collapse the header during scroll;
 *    keeping a fixed overlay inside it would clip the sheet to the nav
 *    height. This preserves the correct stacking order without coupling
 *    the sheet to the header's clipping container.
 *  - The prototype's avatar circle is hardcoded to the letter "S" (a
 *    leftover from its mock data, never actually wired to the signed-in
 *    user's name). This version computes the initial from the real
 *    Supabase user instead, since a real user is available here.
 *  - The `showCloseButton` variant (used by the prototype for its
 *    manage-account/settings/how-it-works sub-pages) isn't ported — those
 *    sub-pages don't exist in apps/mobile yet.
 *  - `onBack`/back-arrow support *is* ported (added 2026-08-09 for the deal-
 *    assessment page), but not as a prop — since this header is mounted
 *    once in layout.tsx above the router outlet, pages instead publish an
 *    override via `usePageHeader()` (see lib/header-context.tsx), which
 *    this component reads back out. Matches Prototype/index.html's own
 *    comment (line ~1569) that the account menu/avatar stays visible even
 *    on a back-button screen, rather than DealModal rendering a separate
 *    header of its own.
 *  - A global search icon lived here next to the avatar from 2026-08-09
 *    until 2026-08-11 (Jay: "remove the search icon from the top nav bar"),
 *    removed outright rather than relocated. Worth knowing this reopens a
 *    gap that icon was specifically added to close: `/specials`, `/lists`,
 *    and `/me` still have no search bar of their own (only Home's own
 *    inline bar opens the full-screen search overlay now), so on those
 *    three routes there's currently no way to reach search at all. Not
 *    fixed here since Jay didn't ask for a replacement -- flagged as a
 *    follow-up in case that's an oversight rather than intentional.
 *  - The 4 menu items below switched from Title Case + `uppercase` (visual
 *    ALL CAPS regardless of source casing) to real sentence case
 *    (2026-08-13, per Jay's ask to "update the settings bottom sheets to
 *    use sentence case for items in the list") -- "How Dodgy Deal Works" ->
 *    "How Dodgy Deal works", "Manage Account" -> "Manage account", "Log
 *    Out" -> "Log out", "Create Account / Log In" -> "Create account / log
 *    in". "Dodgy Deal" stays capitalized in the first one as the brand
 *    name, same as everywhere else in the app. Needed dropping the
 *    `uppercase` Tailwind class on each item too, not just changing the
 *    source strings -- `text-transform: uppercase` unconditionally
 *    uppercases the rendered text regardless of casing in the JSX, so the
 *    string-only change alone wouldn't have been visible. This sheet is
 *    the only real "settings"-style list of navigable items in the app
 *    (checked `ScannerModal.tsx`'s and the deal-assessment page's own
 *    bottom sheets too -- neither is a menu of list items in this sense:
 *    one's a scan/upload action sheet, the other's a product-comparison
 *    list). The small "Account" eyebrow label above these items was
 *    initially left uppercase in this same entry (a section heading, not
 *    a "list item"), but Jay's very next ask -- "scan the app to ensure
 *    there are no capitals only texts, app should use sentence case" --
 *    is broader than just this sheet's list items, so the `uppercase`
 *    class came off this label too (same day, immediate follow-up). Its
 *    source string was already "Account" (one capitalized word), so
 *    dropping the class alone was enough here -- no string change needed,
 *    unlike the 4 menu items above. Same app-wide sweep also caught the
 *    dev-only "Test mode" banner just above (`isAnonymousSession` branch,
 *    named `isFakeSession` at the time) -- its source text was already
 *    sentence case too, `uppercase` class dropped, no string change. (That
 *    banner's own copy changed again 2026-08-13 for an unrelated reason --
 *    see its own comment just above in the JSX -- once the test account it
 *    describes stopped being fake.)
 *
 * `<header>`'s own fill swapped `bg-stone-50` -> `bg-white` (2026-08-20, per
 * Jay: "Make the top nav bar on all pages, a slightly lighter grey than the
 * background of the app") -- `globals.css`'s own `body { background: var(
 * --background) }` is `#fafaf9`, this app's own stone-50, and this header
 * was rendering that exact same token, so there was zero visual separation
 * between the bar and the page scrolling underneath it. No lighter grey
 * token exists anywhere in this project's own palette (`globals.css`'s
 * `@theme` block only defines custom `ink-*`/`fair-*`/`dodgy-*`/`alert-*`
 * scales plus a couple of one-off tokens like `--color-paper` -- every
 * `stone-*` class used app-wide, including the one this header used, is
 * Tailwind's own unmodified default scale, and stone-100 is a shade
 * *darker* than stone-50, not lighter) -- plain `bg-white` is the only
 * "lighter than stone-50" option available without inventing a new token
 * for a one-line change, and reads as the "slightly lighter grey" Jay
 * described since white sits only barely above stone-50 (#fafaf9) on the
 * lightness scale, not a stark, high-contrast jump.
 */

const ROUTE_TITLES: Record<string, string> = {
  // "Lists" (2026-08-15, My List page changes) -- was "My List". Only
  // this label changed; the route itself, BottomNav.tsx's own tab label,
  // and every doc comment elsewhere in this app that still says "My
  // List"/"S1 -- My Lists" describing the feature by name are unaffected
  // and deliberately left as-is (see BottomNav.tsx before touching its
  // own tab label for the same reason -- Jay didn't ask for that one).
  "/lists": "Lists",
  "/specials": "Specials",
  // "Deal stats" (2026-08-11), matching BottomNav.tsx's own label change
  // for this same route -- was "Me". Keeps the sticky top bar and the
  // bottom-nav tab in agreement rather than showing two different names
  // for the one screen.
  "/me": "Deal stats",
  "/history": "All Checks",
};

function greetingName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const metaName = user.user_metadata?.full_name;
  const source = (typeof metaName === "string" && metaName) || user.email || "";
  const first = source.split(/[\s@]/)[0];
  return first || "there";
}

export default function AppHeader() {
  const pathname = usePathname();
  const { user, loading, signOut, isAnonymousSession, openAuthSheet } = useAuth();
  const { override } = useHeaderOverride();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHiddenOnCheckDeals, setIsHiddenOnCheckDeals] = useState(false);

  useEffect(() => {
    return subscribeToCheckDealsHeaderVisibility((hidden) => {
      setIsHiddenOnCheckDeals(hidden);
    });
  }, []);

  // Close the menu on route change so it doesn't stay open across
  // navigation. Adjusted during render (React's documented escape hatch for
  // "state that depends on a prop changing") rather than in a useEffect --
  // an effect calling setState synchronously on every dependency change
  // trips react-hooks/set-state-in-effect, which this codebase otherwise
  // keeps clean (see page.tsx's lazy useState comment for the same pattern
  // used elsewhere in this app).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsMenuOpen(false);
    setIsHiddenOnCheckDeals(false);
  }

  const title = override
    ? override.title
    : pathname === "/"
      ? user
        ? `Kia ora, ${greetingName(user)}`
        : "Dodgy Deal"
      : ROUTE_TITLES[pathname] || "Dodgy Deal";

  const avatarInitial = user ? greetingName(user).charAt(0).toUpperCase() : null;

  // Mascot mark hidden on the three routes that set a header override --
  // all asked for individually, same day (2026-08-14): the deal-assessment
  // page ("remove the dodgy deal logo man from deal assessment pages top
  // nav bar"), Manage Account ("remove the mascot icon from the manage
  // account page"), and How Dodgy Deal Works ("also remove the mascot from
  // the how dodgy deals works page"). That's now every route `override`
  // covers, but still gated on pathname rather than on `override` itself --
  // `override` is only set from a child page's own `useEffect` (see
  // header-context.tsx), so it's briefly null on first paint even on these
  // routes; gating on it would flash the mascot for one frame on every
  // navigation here instead of never showing it. Every OTHER route (Home,
  // My List, Specials, Deal stats, All Checks) keeps the mascot per the
  // 2026-08-13 "every screen" revert documented below.
  const showLogoMark = !["/account", "/how-it-works"].includes(pathname) && !pathname.startsWith("/deal/");

  return (
    // Sticky wrapper (not the <header> itself, see below) so the test-mode
    // strip and the real header bar stick together as one unit -- 2026-08-09,
    // added alongside the dev-only test-account button (lib/auth-context.tsx).
    // This banner is the whole reason `isAnonymousSession` is surfaced through
    // context at all: even though the test account is a real, working
    // Supabase account since 2026-08-13 (see auth-context.tsx's own doc
    // comment), it still has no email attached to it and can't be signed
    // back into from another device/browser, so it must never be silently
    // indistinguishable from a real named account while testing. Copy
    // updated 2026-08-13 alongside that swap -- used to say "fake local
    // login, no real account or data," which became false once the account
    // itself became real.
    <>
    <div
      className={`app-header-shell sticky top-0 z-[45] w-full flex-shrink-0 ${pathname === "/" && isHiddenOnCheckDeals ? "is-hidden" : ""}`}
      aria-hidden={pathname === "/" && isHiddenOnCheckDeals}
    >
      <div className={`app-header-content ${pathname === "/" && isHiddenOnCheckDeals ? "is-hidden" : ""}`}>
      {isAnonymousSession && (
        <div className="flex items-center justify-center bg-amber-400 px-4 py-1 text-center text-[11px] font-black tracking-widest text-amber-950">
          Test mode — anonymous test account, not linked to an email
        </div>
      )}
      {/* `shadow-sm` added 2026-08-20, per Jay: "give the header top nav a
          tight drop shadow like the other components have" -- same
          `shadow-sm` utility `SearchBar.tsx`/`DealCard.tsx`/
          `ProductListCard.tsx` already use for "the same tight drop shadow"
          across this app (see `SearchBar.tsx`'s own 2026-08-17 doc comment
          for that precedent), not a new/different shadow value invented
          for this bar. Sits on `<header>` itself, not the outer sticky
          `<div>` wrapping it + the anonymous-test-mode banner -- the banner
          (when shown) sits visually above this bar, not under it, so the
          shadow belongs to the white bar's own bottom edge specifically,
          same edge that just picked up separation from the page via this
          same session's earlier `bg-stone-50` -> `bg-white` change. */}
      <header className="flex h-16 w-full items-center justify-between bg-white px-6">
        {/* min-w-0 + flex-1 here (not the old `max-w-[70%]` on the title span)
            -- a percentage max-width only resolves against a *definite*
            containing-block width, and this wrapper's width was otherwise
            "auto"/shrink-to-fit (a plain flex item with no explicit size), so
            the 70% cap was effectively arbitrary rather than reliably "however
            much space is actually left" once the back button and/or a wider
            account-menu area were present. flex-1 gives this wrapper an
            actual definite width (remaining space after the avatar area),
            and min-w-0 on both this wrapper and the title span itself lets
            that definite width shrink below the title's intrinsic content
            width -- required for `truncate`'s overflow-hidden/ellipsis to
            engage at all in a flex row. */}
        {/* `pr-2` (2026-08-17, per Jay: "the title on the deal assessment
            pages in the top nav needs to truncate a bit sooner") -- this
            wrapper is `flex-1`, so the title `<span>` below (itself
            `flex-1 truncate`) claims every last px of remaining width
            before the avatar area, meaning the ellipsis previously only
            engaged once text was flush against the avatar circle with no
            breathing room. `pr-2` reserves 8px of guaranteed gap so
            `truncate` kicks in slightly earlier instead, at the same
            visual point every route with an override title (this page,
            `/account`, `/how-it-works`) now shares -- global on this
            shared header rather than deal-page-scoped since there's no
            per-page styling hook here (`HeaderOverride` only carries
            `title`/`onBack`, see header-context.tsx), but harmless for the
            other two: their titles are short, fixed strings ("Account",
            "How Dodgy Deal Works") that don't reach the truncation
            boundary either way, so only the deal page's long, dynamic
            product-name titles are actually affected. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
          {/* Mascot mark, top-left of the global nav bar -- added 2026-08-12
              on every screen, narrowed the same day (still per Jay's ask)
              to Home only, so it wouldn't compete with the back
              button/title on every other route. Reverted back to every
              screen 2026-08-13, per Jay's ask to "keep the dodgy icon man
              on each page's top header bar so it appears before page
              titles (same as the home page)". Same /logo.svg the mascot
              uses elsewhere (LoadingMascot/PageLoader/ErrorState), just
              static here rather than animated. Always links to `/` (tapping
              the mark goes home from anywhere, standard logo behaviour),
              not just a decorative mark on other routes (well, the routes
              that still show it -- see `showLogoMark` above, added
              2026-08-14: it's now off on every route that sets a header
              override, so the "mascot ahead of a back arrow" layout this
              comment used to describe no longer happens anywhere in this
              app, even though `/account`/`/how-it-works`/the deal page all
              still set `override` for their title + back arrow). */}
          {showLogoMark && (
            <Link href="/" aria-label="Dodgy Deal home" className="flex-shrink-0">
              <Image
                src="/logo.svg"
                alt=""
                width={28}
                height={28}
                className={`h-7 w-7 ${pathname === "/me" ? "" : "animate-mascot-header-blink"}`}
              />
            </Link>
          )}
          {override && (
            <button
              onClick={override.onBack}
              aria-label="Back"
              className="-ml-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <span className="min-w-0 flex-1 truncate font-display text-base font-black tracking-normal text-ink-900">
            {title}
          </span>
        </div>

        <div className="relative flex flex-shrink-0 items-center gap-3">
          {loading ? null : user ? (
            <button
              onClick={() => setIsMenuOpen((open) => !open)}
              id="global-header-profile-btn"
              aria-label="Account menu"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-fair-600 text-base font-black text-white transition-all duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
            >
              {avatarInitial}
            </button>
          ) : (
            <button
              onClick={() => setIsMenuOpen((open) => !open)}
              id="global-header-profile-btn"
              aria-label="Account menu"
              className="flex h-9 w-9 items-center justify-center text-stone-900 transition-all duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
            >
              {/* Filled black silhouette, not lucide's outline `CircleUser`
                  (2026-08-20, per Jay: "Use a filled in (black) user
                  profile icon and make the icon larger, the size of the
                  whole circle container") -- `User` (the plain person
                  silhouette, no circle frame of its own -- this button's
                  own `bg-stone-100` rounded-full IS the frame now) with
                  `fill="currentColor"`/`stroke="none"` instead of lucide's
                  default `fill="none"`/`stroke="currentColor"` -- lucide
                  ships one outline style per icon, no separate "filled"
                  variant, so this is the standard way to get a solid glyph
                  out of it: `User`'s own 2 shapes (a head circle, and an
                  open shoulders path that SVG auto-closes with a straight
                  line for fill purposes) read as one solid silhouette once
                  filled. `CircleUser` was tried first and rejected -- its
                  own outer ring is a SEPARATE `<circle>` from the inner
                  head, so filling it solid just paints the whole thing one
                  flat disc with no visible face, not a recognisable
                  profile icon.
                  `h-8 w-8` (was `h-5 w-5`) matches the button's own size
                  exactly -- the icon now fills the circle edge-to-edge
                  instead of floating in the middle with visible padding
                  around it, same "icon = the whole container" idea this
                  app's oversized bottom-sheet/header icons elsewhere
                  already use. `overflow-hidden` added to the button itself
                  since the icon's square bounding box is now exactly as
                  large as the circular button -- without it, the SVG's own
                  corner padding could show past the rounded edge at this
                  size; with it, anything outside the circle is clipped the
                  same way a real avatar photo would be. */}
              <span
                className="material-symbols-outlined text-[32px]"
                style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                aria-hidden="true"
              >
                account_circle
              </span>
            </button>
          )}
        </div>
      </header>
      </div>
    </div>

    {/* Keep the profile overlay outside `.app-header-shell`: that shell uses
        `overflow: hidden` so it can collapse while scrolling. A fixed
        descendant inside that clipped shell is constrained to the header
        height, which makes the sheet appear to open in the top nav and then
        disappear. */}
    <AnimatePresence>
      {isMenuOpen && (
        <>
          <motion.div
            key="profile-menu-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
          />
          <motion.div
            key="profile-menu-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              {/* Bottom-sheet title style unified app-wide 2026-08-19 --
                  was a small tracking-widest text-stone-500 eyebrow label,
                  now a real title, same class every bottom sheet's top
                  title uses (see app/page.tsx's Sort sheet for the full
                  cross-reference). `<h3>`, not `<span>`, to match. */}
              <h3 className="font-display text-lg font-black tracking-normal text-stone-900">Account</h3>
              <button
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {/* Leading icon on each item (2026-08-14, Jay: "In the
                account bottom sheet - add icons before each of the
                items") -- every row switched from `block` to `flex
                items-center gap-3` to lay the icon and label out
                horizontally instead of the icon needing its own absolute
                position; text/hover/border/spacing classes otherwise
                unchanged from before. Icons picked to match each row's
                own existing color (the two `stone-700` rows get a plain
                `stone-500` icon, "Log out"'s `alert-600` icon matches its
                text, "Create account / log in"'s `ink-600` icon matches
                its text) rather than a single neutral icon color for all
                four. */}
            <div className="py-2 pb-safe-sm">
              <Link
                href="/how-it-works"
                onClick={() => setIsMenuOpen(false)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-black tracking-wider text-stone-700 transition-colors hover:bg-stone-50"
              >
                <span
                  className="material-symbols-outlined shrink-0 text-[22px] text-stone-500"
                  style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                  aria-hidden="true"
                >
                  help_center
                </span>
                How Dodgy Deal works
              </Link>
              {user ? (
                <>
                  <Link
                    href="/account"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex w-full items-center gap-3 border-t border-stone-100 px-5 py-4 text-left text-sm font-black tracking-wider text-stone-700 transition-colors hover:bg-stone-50"
                  >
                    <UserCog className="h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
                    Manage account
                  </Link>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      signOut();
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 border-t border-stone-100 px-5 py-4 text-left text-sm font-black tracking-wider text-alert-600 transition-colors hover:bg-alert-50 hover:text-alert-700"
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Log out
                  </button>
                </>
              ) : (
                // Was `<Link href="/lists">` -- opened the Lists tab
                // instead of the actual sign-in/create-account sheet, so
                // tapping this from the profile menu never actually let a
                // signed-out visitor log in or create an account, it just
                // dropped them on Lists' own signed-out empty state (which
                // then required a SECOND tap on its own "Log in or create
                // an account" button to get anywhere). Fixed 2026-08-19,
                // per Jay: "this should link to the actual create account
                // sign in bottom sheet" -- now a real button that closes
                // this menu and calls `openAuthSheet()` directly, same as
                // every other "Log in or create an account" entry point in
                // the app (Lists/History/Deal stats/Account's own empty
                // states, all `openAuthSheet(prompt)` -- see those pages'
                // own doc comments). No page-specific prompt copy here
                // (unlike those four), since this entry point isn't gated
                // behind any one page's content.
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    openAuthSheet();
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 border-t border-stone-100 px-5 py-4 text-left text-sm font-black tracking-wider text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-700"
                >
                  <span
                    className="material-symbols-outlined shrink-0 text-[22px]"
                    style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                    aria-hidden="true"
                  >
                    app_registration
                  </span>
                  Create account / log in
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}
