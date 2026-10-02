"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
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
const OnboardingTour = dynamic(() => import("@/components/OnboardingTour"), {
  ssr: false,
  loading: OverlayChunkFallback,
});

const ONBOARDING_TOUR_SEEN_PREFIX = "dd-onboarding-tour-seen:";

function hasSeenOnboardingTour(userId: string): boolean {
  try {
    return window.localStorage.getItem(`${ONBOARDING_TOUR_SEEN_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

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
  const {
    user,
    isAuthSheetOpen,
    hasOpenedAuthSheet,
    authSheetPrompt,
    closeAuthSheet,
    onboardingTourRequest,
    dismissOnboardingTour,
  } = useAuth();
  const [isPreviewTourOpen, setIsPreviewTourOpen] = useState(
    () =>
      process.env.NODE_ENV !== "production" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "onboarding"
  );

  // Warm the search sheet chunk immediately after the shell hydrates. The
  // sheet remains off-screen until requested, but its first opening no
  // longer waits on a separate network/module load before the fade begins.
  useEffect(() => {
    void import("@/components/FullScreenSearch");
  }, []);

  useEffect(() => {
    if (user && onboardingTourRequest === "new" && hasSeenOnboardingTour(user.id)) {
      dismissOnboardingTour();
    }
  }, [dismissOnboardingTour, onboardingTourRequest, user]);

  const isOnboardingTourOpen =
    isPreviewTourOpen ||
    (!!user &&
      !!onboardingTourRequest &&
      (onboardingTourRequest === "replay" || !hasSeenOnboardingTour(user.id)));

  const closeOnboardingTour = () => {
    if (user) {
      try {
        window.localStorage.setItem(`${ONBOARDING_TOUR_SEEN_PREFIX}${user.id}`, "1");
      } catch {
        // Keep the dismissal effective in memory when local storage is unavailable.
      }
    }
    setIsPreviewTourOpen(false);
    dismissOnboardingTour();
  };

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
      {isOnboardingTourOpen && <OnboardingTour onClose={closeOnboardingTour} />}
    </>
  );
}
