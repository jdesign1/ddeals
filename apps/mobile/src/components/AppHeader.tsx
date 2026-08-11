"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CircleUser } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useHeaderOverride } from "@/lib/header-context";

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
 *    prototype's own state machine. None of those screens exist in
 *    apps/mobile yet, so rather than link to pages that don't exist, the
 *    menu here only offers what's real: log out (signed in) or a link to
 *    /lists, the one page with a working login form (signed out) — same
 *    pattern AddToListButton.tsx already uses for its own "log in" links.
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
 */

const ROUTE_TITLES: Record<string, string> = {
  "/lists": "My List",
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
  const { user, loading, signOut, isFakeSession } = useAuth();
  const { override } = useHeaderOverride();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isMenuOpen]);

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
  }

  const title = override
    ? override.title
    : pathname === "/"
      ? user
        ? `Kia ora, ${greetingName(user)}`
        : "Dodgy Deal"
      : ROUTE_TITLES[pathname] || "Dodgy Deal";

  const avatarInitial = user ? greetingName(user).charAt(0).toUpperCase() : null;

  return (
    // Sticky wrapper (not the <header> itself, see below) so the test-mode
    // strip and the real header bar stick together as one unit -- 2026-08-09,
    // added alongside the dev-only fake login (lib/auth-context.tsx). This
    // banner is the whole reason `isFakeSession` is surfaced through context
    // at all: a fake signed-in state must never be silently indistinguishable
    // from a real one while testing.
    <div className="sticky top-0 z-40 w-full flex-shrink-0">
      {isFakeSession && (
        <div className="flex items-center justify-center bg-amber-400 px-4 py-1 text-center text-[10px] font-black uppercase tracking-widest text-amber-950">
          Test mode — fake local login, no real account or data
        </div>
      )}
      <header className="flex h-16 w-full items-center justify-between bg-stone-50 px-6">
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
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {override && (
            <button
              onClick={override.onBack}
              aria-label="Back"
              className="-ml-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <span className="min-w-0 flex-1 truncate font-display text-base font-black tracking-tighter text-ink-900">
            {title}
          </span>
        </div>

        <div ref={menuRef} className="relative flex flex-shrink-0 items-center gap-3">
          {loading ? null : user ? (
            <button
              onClick={() => setIsMenuOpen((open) => !open)}
              id="global-header-profile-btn"
              aria-label="Account menu"
              className={`flex h-8 w-8 items-center justify-center rounded-full bg-fair-600 text-base font-black text-white transition-all duration-150 ease-in-out ${
                isMenuOpen ? "ring-2 ring-ink-200" : ""
              }`}
            >
              {avatarInitial}
            </button>
          ) : (
            <Link
              href="/lists"
              id="global-header-profile-btn"
              aria-label="Log in or create an account"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors duration-150 ease-in-out hover:bg-stone-200"
            >
              <CircleUser className="h-5 w-5" aria-hidden="true" />
            </Link>
          )}

          {isMenuOpen && user && (
            <div className="absolute right-0 top-12 z-50 w-48 rounded-2xl border border-stone-200 bg-white py-2 shadow-xl animate-fadeIn">
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  signOut();
                }}
                className="block w-full cursor-pointer px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-alert-600 transition-colors hover:bg-alert-50 hover:text-alert-700"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </header>
    </div>
  );
}
