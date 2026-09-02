import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Manrope } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import GlobalOverlays from "@/components/GlobalOverlays";
import LaunchSplash from "@/components/LaunchSplash";
import ScrollContainer from "@/components/ScrollContainer";
import { AuthProvider } from "@/lib/auth-context";
import { HeaderOverrideProvider } from "@/lib/header-context";
import { SearchProvider } from "@/lib/search-context";
import { CardLayoutProvider } from "@/lib/card-layout-context";
import { ThemeProvider } from "@/lib/theme-context";
import "./globals.css";

// Brand Guide v1.0 ("04 — TYPE"): Inter for everything read closely --
// prices, product names, body copy. Replaces Geist Sans (2026-08-13 UI
// tidy-up); Geist Mono is also dropped here since nothing in the app
// referenced `font-mono` -- it was dead weight, loaded but unused.
// "800" included (peer review caught this) because `font-extrabold`/
// `font-black` (Tailwind 800/900) show up a lot on non-`font-display` text
// too (AppHeader, AuthPanel, ScannerModal, ProductListCard, page headers,
// etc) -- without a loaded 800 weight file the browser would synthetic-bold
// Inter-700 instead of rendering a true ExtraBold instance. 900 itself
// isn't requestable from Google's static Inter API at all, so `font-black`
// text still ends up on the same synthetic bold as before either way.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Prototype/index.html's "Dodgy Deal · Mobile UI Kit" uses Manrope for
// display/heading text (its Tailwind config's `font-display`), which
// AppHeader's title reuses here — see globals.css's `--font-display` token.
// Brand Guide v1.0 confirms this: "Manrope for headlines -- geometric,
// friendly, confident."
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Dodgy Deal",
  description: "Real savings vs dodgy fake discounts, across NZ supermarkets.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf8f4",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${manrope.variable} h-full bg-stone-100 antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=window.localStorage.getItem("dodgey-deals-theme");var theme=stored==="dark"||stored==="light"?stored:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){}})();`,
          }}
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:FILL,GRAD,opsz,wght@0..1,0..200,20..48,100..700&icon_names=account_circle,app_registration,balance,check_circle,help_center,leaderboard,list_alt_add,search,search_check_2,settings,warning,workspace_premium&display=block"
        />
      </head>
      <body className="h-dvh flex flex-col overflow-hidden bg-stone-100">
        <AuthProvider>
          <ThemeProvider>
            <HeaderOverrideProvider>
            {/* SearchProvider (lib/search-context.tsx, 2026-08-09) -- global
                full-screen search state, so tapping the search bar/icon from
                ANY screen (not just Home) opens the same overlay. Wraps
                AppHeader + the router outlet + GlobalOverlays so all three
                can reach it via `useSearch()`, same pattern
                HeaderOverrideProvider already uses for AppHeader's title
                override. */}
              <CardLayoutProvider>
                <SearchProvider>
              <LaunchSplash />
              {/* This bottom padding (2026-08-12) -- BottomNav went from a
                  normal flex sibling (its own row, reserving space below
                  this scroll container) to `fixed` (see that component's
                  own doc comment: Jay's translucent/blurred nav had
                  nothing behind it to actually blur, since content never
                  used to scroll underneath it). Now that content DOES
                  extend the full viewport height behind the fixed nav,
                  this padding reserves the same amount of space at the
                  bottom so real content never sits physically underneath/
                  obscured by the nav at rest -- originally sized to match
                  the nav's own rendered height alone (`py-2.5` + `h-8`
                  icon + `gap-1` + label text ≈ 4.5rem) plus the safe-area
                  inset at the bottom of the screen. Widened 2026-08-13
                  when BottomNav became a floating pill (that component's
                  own doc comment) instead of sitting flush against the
                  bottom edge -- clearance now needs to cover the pill's
                  full floating footprint, not just its own height: the
                  same 4.5rem nav height, PLUS the same safe-area inset as
                  before (still needed so a device's home-indicator inset
                  doesn't eat into this clearance either) -- 4.5rem total,
                  using underscores in place of
                  spaces around the calc() operators (Tailwind's own
                  convention for arbitrary values; not load-bearing for
                  this app's build, see BottomNav.tsx's own doc comment for
                  why, and for an important warning about never writing a
                  real Tailwind utility name directly against an opening
                  square bracket anywhere in a comment in this codebase --
                  a shorthand version of this exact comment once did that
                  and broke the whole app's build). This exact padding
                  pattern already existed elsewhere in the app before this
                  session (`FullScreenSearch.tsx`, `AppHeader.tsx`,
                  `app/page.tsx`) -- flagged in project.md, not touched
                  here, out of scope for this change.

                  Update (2026-08-14): moved off the Tailwind arbitrary-value
                  bracket class entirely -- the calc()-plus-safe-area-inset
                  padding-bottom class above, and its three siblings
                  (`FullScreenSearch.tsx`, `AppHeader.tsx`, `app/page.tsx`),
                  were reliably getting mangled by the Tailwind v4.3.3 (oxide)
                  class-candidate
                  scanner under Turbopack whenever the file also had
                  multi-byte characters (em dashes, "≈", "·") in nearby
                  comments -- the exact same class of bug the "never write a
                  real Tailwind utility name against an opening square
                  bracket in a comment" warning above already describes, just
                  hitting real `className` usage instead of a comment this
                  time. Same value, now `.pb-safe-nav` in globals.css (plain
                  CSS, not scanned) -- see that file's own comment.

                  Update (2026-08-17): this div moved into its own small
                  client component, `ScrollContainer.tsx` -- per Jay's ask to
                  remove `BottomNav` from the deal-assessment page,
                  `pb-safe-nav`'s nav-height reservation needs to drop to
                  `pb-safe-sm` specifically on that route (no nav there
                  anymore to reserve space for), which needs `usePathname()`;
                  this file itself is a server component (exports
                  `metadata`), so that route check had to move to its own
                  client boundary rather than converting this whole layout
                  to `"use client"`. See `ScrollContainer.tsx`'s and
                  `BottomNav.tsx`'s own doc comments for the full pairing --
                  same ask, two files, hiding the nav is the mount site the
                  other half lives at. */}
              <ScrollContainer>{children}</ScrollContainer>
              <BottomNav />
              {/* Mounted once, globally, so FullScreenSearch/ScannerModal are
                  available regardless of which route is active -- previously
                  both only existed inside Home's own page.tsx. */}
              <GlobalOverlays />
                </SearchProvider>
              </CardLayoutProvider>
            </HeaderOverrideProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
