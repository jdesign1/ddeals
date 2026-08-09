"use client";

import FullScreenSearch from "@/components/FullScreenSearch";
import ScannerModal from "@/components/ScannerModal";
import { useSearch } from "@/lib/search-context";

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
 */
export default function GlobalOverlays() {
  const { isScannerOpen, closeScanner, openSearch } = useSearch();

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
    </>
  );
}
