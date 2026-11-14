"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useSearchNavigation } from "@/lib/search-context";
import { useAuthOverlay, useAuthStatus } from "@/lib/auth-context";
import FirstInstallOnboarding from "@/components/FirstInstallOnboarding";

function OverlayChunkFallback() {
  return (
    <div
      className="theme-loader-surface fixed inset-0 z-[50]"
      role="status"
      aria-label="Loading"
    />
  );
}

// Search already fades in once its chunk is ready. Keep the first-open
// loading state transparent so a slow initial module fetch never replaces the
// current screen with an opaque white flash before that transition begins.
function SearchChunkFallback() {
  return <div className="pointer-events-none fixed inset-0 z-[50]" aria-hidden="true" />;
}

// Keep the heavier surfaces in separate chunks. FullScreenSearch is mounted
// as a transparent shell from the first paint so the first tap never has to
// wait for a chunk mount; the other surfaces remain lazy until requested.
const FullScreenSearch = dynamic(() => import("@/components/FullScreenSearch"), {
  ssr: false,
  loading: SearchChunkFallback,
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
const ANONYMOUS_ONBOARDING_TOUR_ID = "anonymous";
const FIRST_INSTALL_ONBOARDING_KEY = "dd-first-install-onboarding:v1";

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
 * own state straight from the focused search contexts now (no props), matching
 * how `AppHeader` reaches into its focused auth/header contexts itself
 * rather than taking them as props from `layout.tsx`. `ScannerModal` stays
 * a plain, generic, prop-driven component (isOpen/onClose/onSearchForItem)
 * -- this is its one real usage site now that Home no longer mounts its own
 * copy, so it's wired here instead of also being made context-aware.
 *
 * `AuthSheet` (2026-08-19, per Jay: "The login/sign up screen needs it's
 * own dedicated bottom sheet, and not live on the Lists page") added here
 * the same way -- mounted once, globally, driven by `isAuthSheetOpen`/
 * `authSheetPrompt`/`closeAuthSheet` from `useAuthOverlay()` plus the current
 * user from `useAuthStatus()` (auth-context.tsx's own doc comment explains why
 * that state lives there rather than in search-context.tsx alongside the scanner).
 * Every gated page (/lists,
 * /me, /history, /account) now just calls `openAuthSheet(prompt)` instead
 * of rendering `AuthPanel` inline as its entire page content.
 *
 */
export default function GlobalOverlays() {
  const { isScannerOpen, hasOpenedScanner, closeScanner, openSearch } = useSearchNavigation();
  const { user, profile, loading, profileLoading } = useAuthStatus();
  const {
    isAuthSheetOpen,
    hasOpenedAuthSheet,
    authSheetPrompt,
    closeAuthSheet,
    onboardingTourRequest,
    dismissOnboardingTour,
  } = useAuthOverlay();
  const [isPreviewTourOpen, setIsPreviewTourOpen] = useState(
    () =>
      process.env.NODE_ENV !== "production" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "onboarding"
  );
  const [isFirstInstallOnboardingOpen, setIsFirstInstallOnboardingOpen] = useState(false);
  const [isFirstInstallStatusReady, setIsFirstInstallStatusReady] = useState(false);
  const [isFirstInstallTourOpen, setIsFirstInstallTourOpen] = useState(false);

  useLayoutEffect(() => {
    if (isPreviewTourOpen) {
      setIsFirstInstallStatusReady(true);
      return;
    }

    // Wait for auth restoration before showing a first-install gate. An
    // existing signed-in account should not see this after an app update.
    if (loading || (user && profileLoading)) return;

    let completed = false;
    try {
      completed = window.localStorage.getItem(FIRST_INSTALL_ONBOARDING_KEY) === "1";
      if (!completed && user && profile?.onboarding_complete && profile.category_interests_prompted_at) {
        completed = true;
      }
      if (!completed && hasSeenOnboardingTour(user?.id ?? ANONYMOUS_ONBOARDING_TOUR_ID)) {
        completed = true;
      }

      // Treat durable app preferences and prior activity snapshots as proof
      // this is an existing install when upgrading from a version without the
      // first-install marker.
      if (!completed) {
        const knownInstallKeys = [
          "dodgey-deals-card-layout",
          "dodgey-deals:check-deals-belt-order:v1:device",
        ];
        completed = knownInstallKeys.some((key) => window.localStorage.getItem(key) !== null) ||
          Object.keys(window.localStorage).some((key) =>
            key.startsWith("dd-top20-snapshot-v1:") ||
            key.startsWith("dodgey-deals:did-you-know-seen:v2:") ||
            key.startsWith("dd-semantic-specials-snapshot-v2:") ||
            key.startsWith("dd-semantic-specials-popup-state-v1:") ||
            key.startsWith("dd-deal-detective-played-v1:")
          );
      }
      if (completed) window.localStorage.setItem(FIRST_INSTALL_ONBOARDING_KEY, "1");
    } catch {
      // Keep the first-run path available when storage is disabled.
    }
    setIsFirstInstallOnboardingOpen(!completed);
    setIsFirstInstallStatusReady(true);
  }, [isPreviewTourOpen, loading, profile, profileLoading, user]);

  useEffect(() => {
    if (user && onboardingTourRequest === "new" && hasSeenOnboardingTour(user.id)) {
      dismissOnboardingTour();
    }
  }, [dismissOnboardingTour, onboardingTourRequest, user]);

  // A newly completed account can briefly publish the "new" request before
  // the auth listener has populated `user`. Wait for that user before opening
  // first-run onboarding, otherwise the dismissal could be recorded against
  // the anonymous device key instead of the new account. Explicit replay is
  // still available to logged-out visitors.
  const canOpenRequestedTour =
    onboardingTourRequest === "replay" || (onboardingTourRequest === "new" && !!user);
  const isOnboardingTourOpen =
    isPreviewTourOpen ||
    (canOpenRequestedTour &&
      (onboardingTourRequest === "replay" || !hasSeenOnboardingTour(user?.id ?? ANONYMOUS_ONBOARDING_TOUR_ID)));
  const onboardingUserId = user?.id ?? ANONYMOUS_ONBOARDING_TOUR_ID;

  const handleScannerSearch = useCallback(() => {
    closeScanner();
    openSearch();
  }, [closeScanner, openSearch]);

  const closeOnboardingTour = useCallback(() => {
    try {
      window.localStorage.setItem(`${ONBOARDING_TOUR_SEEN_PREFIX}${onboardingUserId}`, "1");
    } catch {
      // Keep the dismissal effective in memory when local storage is unavailable.
    }
    setIsPreviewTourOpen(false);
    dismissOnboardingTour();
  }, [dismissOnboardingTour, onboardingUserId]);

  const completeFirstInstallOnboarding = useCallback(() => {
    try {
      window.localStorage.setItem(FIRST_INSTALL_ONBOARDING_KEY, "1");
    } catch {
      // The current app session can still proceed if storage is unavailable.
    }
    setIsFirstInstallOnboardingOpen(false);
  }, []);

  const startFirstInstallTour = useCallback(() => {
    completeFirstInstallOnboarding();
    setIsFirstInstallTourOpen(true);
  }, [completeFirstInstallOnboarding]);

  const closeFirstInstallTour = useCallback(() => {
    setIsFirstInstallTourOpen(false);
    closeOnboardingTour();
  }, [closeOnboardingTour]);

  return (
    <>
      {/* Keep the search component mounted from the first shell render. Its
          own fixed surface stays transparent and pointer-inert while closed,
          so opening it only changes one opacity transition instead of also
          waiting for a lazy chunk and remounting the results fade. */}
      <FullScreenSearch />
      {(hasOpenedScanner || isScannerOpen) && (
        <ScannerModal
          isOpen={isScannerOpen}
          onClose={closeScanner}
          onSearchForItem={handleScannerSearch}
        />
      )}
      {(hasOpenedAuthSheet || isAuthSheetOpen) && (
        <AuthSheet isOpen={isAuthSheetOpen} prompt={authSheetPrompt} onClose={closeAuthSheet} />
      )}
      {isFirstInstallStatusReady && isFirstInstallOnboardingOpen && (
        <FirstInstallOnboarding
          onComplete={completeFirstInstallOnboarding}
          onStartTour={startFirstInstallTour}
        />
      )}
      {(isOnboardingTourOpen || isFirstInstallTourOpen) && (
        <OnboardingTour
          onClose={isFirstInstallTourOpen ? closeFirstInstallTour : closeOnboardingTour}
          initialStepIndex={isFirstInstallTourOpen ? 1 : 0}
        />
      )}
    </>
  );
}
