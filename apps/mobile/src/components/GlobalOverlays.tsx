"use client";

import FullScreenSearch from "@/components/FullScreenSearch";
import ScannerModal from "@/components/ScannerModal";
import PageLoader from "@/components/PageLoader";
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
 *
 * Second `<PageLoader>` (2026-08-11) -- deliberately a SEPARATE instance
 * from the deal page's own local one, not a shared/lifted one. This one is
 * controlled by `search-context.tsx`'s `isDealNavigationPending` (see that
 * flag's own doc comment for the full "briefly see Home" bug it fixes) and
 * exists specifically to cover the gap between a card tap inside
 * `FullScreenSearch` and the destination deal page actually mounting --
 * since this component, like `FullScreenSearch` itself, lives in
 * `layout.tsx` and is NOT unmounted across a route change, it stays solid
 * through that entire gap without caring how long the route transition
 * takes. The deal page's own local `<PageLoader>` (unchanged) takes over
 * once it mounts and clears this one via `clearDealNavigationPending()`.
 */
export default function GlobalOverlays() {
  const { isScannerOpen, closeScanner, openSearch, isDealNavigationPending } = useSearch();

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
      <PageLoader loading={isDealNavigationPending} />
    </>
  );
}
