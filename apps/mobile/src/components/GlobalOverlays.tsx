"use client";

import FullScreenSearch from "@/components/FullScreenSearch";
import ScannerModal from "@/components/ScannerModal";
import AuthSheet from "@/components/AuthSheet";
import { useSearch } from "@/lib/search-context";
import { useAuth } from "@/lib/auth-context";

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
  const { isScannerOpen, closeScanner, openSearch } = useSearch();
  const { isAuthSheetOpen, authSheetPrompt, closeAuthSheet } = useAuth();

  return (
    <>
      <FullScreenSearch />
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={closeScanner}
        onSearchForItem={() => {
          closeScanner();
          openSearch();
        }}
      />
      <AuthSheet isOpen={isAuthSheetOpen} prompt={authSheetPrompt} onClose={closeAuthSheet} />
    </>
  );
}
