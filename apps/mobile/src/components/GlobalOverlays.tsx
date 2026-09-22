"use client";

import dynamic from "next/dynamic";
import { useSearch } from "@/lib/search-context";
import { useAuth } from "@/lib/auth-context";

function OverlayChunkFallback() {
  return (
    <div
      className="theme-loader-surface fixed inset-0 z-[50]"
      role="status"
      aria-label="Loading"
    />
  );
}

// These surfaces are not needed for the first paint of any route. Keep their
// chunks out of the initial WebView bundle, then keep each component mounted
// after first use so its local filters/animation state still persists while
// the user moves between open and closed states.
const FullScreenSearch = dynamic(() => import("@/components/FullScreenSearch"), {
  ssr: false,
  loading: OverlayChunkFallback,
});
const ScannerModal = dynamic(() => import("@/components/ScannerModal"), {
  ssr: false,
  loading: OverlayChunkFallback,
});
const AuthSheet = dynamic(() => import("@/components/AuthSheet"), {
  ssr: false,
  loading: OverlayChunkFallback,
});

/**
 * Mounted once in layout.tsx (2026-08-09, alongside the new
 * `SearchProvider`) so the full-screen search overlay and the barcode
 * scanner sheet exist exactly once, globally, instead of being remounted
 * (or simply unavailable) per-route. `FullScreenSearch` reads all of its
 * own state straight from `useSearch()` now (no props), matching how
 * `AppHeader` already reaches into `useAuth()`/`useHeaderOverride()` itself
 * rather than taking them as props from `layout.tsx`. `ScannerModal` stays
 * a plain, generic, prop-driven component (isOpen/onClose/onSearchForItem)
 * -- this is its one real usage site now that Home no longer mounts its own
 * copy, so it's wired here instead of also being made context-aware.
 *
 * `AuthSheet` (2026-08-19, per Jay: "The login/sign up screen needs it's
 * own dedicated bottom sheet, and not live on the Lists page") added here
 * the same way -- mounted once, globally, driven by `isAuthSheetOpen`/
 * `authSheetPrompt`/`closeAuthSheet` from `useAuth()` (auth-context.tsx's
 * own doc comment explains why that state lives there rather than in
 * search-context.tsx alongside the scanner). Every gated page (/lists,
 * /me, /history, /account) now just calls `openAuthSheet(prompt)` instead
 * of rendering `AuthPanel` inline as its entire page content.
 *
 */
export default function GlobalOverlays() {
  const { isActive, hasOpenedSearch, isScannerOpen, hasOpenedScanner, closeScanner, openSearch } = useSearch();
  const { isAuthSheetOpen, hasOpenedAuthSheet, authSheetPrompt, closeAuthSheet } = useAuth();

  return (
    <>
      {(hasOpenedSearch || isActive) && <FullScreenSearch />}
      {(hasOpenedScanner || isScannerOpen) && (
        <ScannerModal
          isOpen={isScannerOpen}
          onClose={closeScanner}
          onSearchForItem={() => {
            closeScanner();
            openSearch();
          }}
        />
      )}
      {(hasOpenedAuthSheet || isAuthSheetOpen) && (
        <AuthSheet isOpen={isAuthSheetOpen} prompt={authSheetPrompt} onClose={closeAuthSheet} />
      )}
    </>
  );
}
