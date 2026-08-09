import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import GlobalOverlays from "@/components/GlobalOverlays";
import { AuthProvider } from "@/lib/auth-context";
import { HeaderOverrideProvider } from "@/lib/header-context";
import { SearchProvider } from "@/lib/search-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Prototype/index.html's "Dodgy Deal · Mobile UI Kit" uses Manrope for
// display/heading text (its Tailwind config's `font-display`), which
// AppHeader's title reuses here — see globals.css's `--font-display` token.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Dodgy Deal",
  description: "Real savings vs dodgy fake discounts, across NZ supermarkets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="h-dvh flex flex-col overflow-hidden">
        <AuthProvider>
          <HeaderOverrideProvider>
            {/* SearchProvider (lib/search-context.tsx, 2026-08-09) -- global
                full-screen search state, so tapping the search bar/icon from
                ANY screen (not just Home) opens the same overlay. Wraps
                AppHeader + the router outlet + GlobalOverlays so all three
                can reach it via `useSearch()`, same pattern
                HeaderOverrideProvider already uses for AppHeader's title
                override. */}
            <SearchProvider>
              <AppHeader />
              <div className="flex-1 overflow-y-auto">{children}</div>
              <BottomNav />
              {/* Mounted once, globally, so FullScreenSearch/ScannerModal are
                  available regardless of which route is active -- previously
                  both only existed inside Home's own page.tsx. */}
              <GlobalOverlays />
            </SearchProvider>
          </HeaderOverrideProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
