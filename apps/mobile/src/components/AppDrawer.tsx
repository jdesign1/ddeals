"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Bell, FlaskConical, Gamepad2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { getAccountDisplayName } from "@/lib/account-display";
import { useAuth } from "@/lib/auth-context";
import { useNavigationDrawer } from "@/lib/navigation-drawer-context";
import { useNotificationsData } from "@/lib/notifications-context";
import { useNewSpecialsActions, useNewSpecialsData } from "@/lib/new-specials-context";
import { useSearchCatalogue } from "@/lib/search-context";
import { useSubscriptionStatus } from "@/lib/subscription-context";
import { useWatchlist } from "@/lib/watchlist-context";

const SETTINGS_ROUTE_FALLBACK_MS = 1600;

export default function AppDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    isOpen,
    isTransitioningToSettings,
    beginSettingsNavigation,
    completeSettingsNavigation,
    closeDrawer,
  } = useNavigationDrawer();
  const { user, profile, loading, profileLoading, openAuthSheet, requestOnboardingTour } = useAuth();
  const { unreadAlerts } = useNotificationsData();
  const { canOpenDetectiveCase } = useNewSpecialsData();
  const { requestDetectiveCaseOpen, requestPreviewOpen } = useNewSpecialsActions();
  const { isPremium, loading: subscriptionLoading } = useSubscriptionStatus();
  const { products, catalogueLiveLoaded } = useSearchCatalogue();
  const { savedProductIds, savedItemsReady } = useWatchlist();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const settingsNavigationStartedRef = useRef(false);
  const settingsNavigationFrameRef = useRef<number | null>(null);
  const settingsNavigationSecondFrameRef = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const currentSpecialUnreadItemCount = useMemo(() => {
    if (!catalogueLiveLoaded || !savedItemsReady) return 0;
    const currentSpecialProductIds = new Set(
      products
        .filter((product) => savedProductIds.has(product.id) && product.currentDeals.some((deal) => deal.isOnSpecial === true))
        .map((product) => product.id),
    );
    return new Set(
      unreadAlerts
        .filter((alert) => currentSpecialProductIds.has(alert.product_id))
        .map((alert) => alert.product_id),
    ).size;
  }, [catalogueLiveLoaded, products, savedItemsReady, savedProductIds, unreadAlerts]);

  useEffect(() => {
    settingsNavigationStartedRef.current = false;
  }, [pathname]);

  useEffect(() => () => {
    if (settingsNavigationFrameRef.current !== null) {
      window.cancelAnimationFrame(settingsNavigationFrameRef.current);
    }
    if (settingsNavigationSecondFrameRef.current !== null) {
      window.cancelAnimationFrame(settingsNavigationSecondFrameRef.current);
    }
  }, []);

  // Keep Home covered while App Router swaps the shared scroll surface. The
  // Settings page releases this guard after its own entry animation; the
  // fallback prevents a failed route from leaving the drawer stuck open.
  useEffect(() => {
    if (!isTransitioningToSettings) {
      return;
    }

    const fallbackTimer = window.setTimeout(completeSettingsNavigation, SETTINGS_ROUTE_FALLBACK_MS);
    return () => window.clearTimeout(fallbackTimer);
  }, [completeSettingsNavigation, isTransitioningToSettings, pathname]);

  const navigateToSettings = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (settingsNavigationStartedRef.current) return;
    settingsNavigationStartedRef.current = true;
    beginSettingsNavigation();
    // Give the open drawer a guaranteed paint before App Router swaps the
    // shared scroll surface. It stays visible until the Settings route has
    // rendered, then the effect above closes it after two frames.
    settingsNavigationFrameRef.current = window.requestAnimationFrame(() => {
      settingsNavigationFrameRef.current = null;
      settingsNavigationSecondFrameRef.current = window.requestAnimationFrame(() => {
        settingsNavigationSecondFrameRef.current = null;
        router.push("/settings");
      });
    });
  };

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") closeDrawer();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      document.getElementById("global-header-menu-btn")?.focus();
    }
  }, [closeDrawer, isOpen]);

  const displayName = user ? getAccountDisplayName(user, { full_name: profile?.full_name }) : "Your account";
  const avatarInitial = user ? displayName.charAt(0).toUpperCase() : null;
  const accountCardLoading = loading || Boolean(user && profileLoading && !profile);

  return (
    <>
      <AnimatePresence initial={false}>
        {isTransitioningToSettings && (
          <motion.div
            key="settings-route-cover"
            aria-hidden="true"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
            className="pointer-events-none fixed inset-0 z-[78] mx-auto w-full max-w-[480px] bg-stone-100"
          />
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={isOpen ? 0 : -1}
        onClick={closeDrawer}
        className={`app-drawer-scrim fixed inset-0 z-[79] mx-auto w-full max-w-[480px] bg-stone-950/35 ${isOpen ? "is-open" : ""}`}
      />
      <aside
        id="global-navigation-drawer"
        aria-label="Main menu"
        aria-modal="true"
        aria-hidden={!isOpen}
        role="dialog"
        inert={isOpen ? undefined : true}
        className={`app-side-drawer fixed inset-y-0 left-0 z-[80] flex flex-col bg-white shadow-2xl ${isOpen ? "is-open" : ""}`}
      >
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="font-display text-lg font-extrabold text-ink-900">Dodgy Deal</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeDrawer}
            aria-label="Close menu"
            className="app-drawer-close flex h-11 w-11 items-center justify-center text-stone-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 [-webkit-tap-highlight-color:transparent]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 pb-4">
          {accountCardLoading ? (
            <div className="h-[76px] animate-pulse rounded-2xl bg-stone-100" aria-label="Loading account" />
          ) : user ? (
            <Link
              href="/settings"
              onClick={navigateToSettings}
              aria-label="Open profile settings"
              className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
            >
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-fair-600 text-lg font-bold text-white">
                {avatarInitial}
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate dd-type-control text-stone-900">{displayName}</span>
                  {!subscriptionLoading && isPremium && (
                    <span className="shrink-0 rounded-full bg-fair-100 px-2 py-0.5 dd-type-badge text-fair-800">Plus</span>
                  )}
                </span>
                <span className="block dd-type-meta text-stone-500">Deal detective</span>
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                openAuthSheet();
              }}
              className="flex min-h-[76px] w-full items-center gap-3 rounded-2xl bg-stone-50 px-4 py-2.5 text-left transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
            >
              <Image
                src="/logo.svg"
                alt=""
                width={48}
                height={48}
                className="theme-logo h-12 w-12 flex-shrink-0"
                aria-hidden="true"
              />
              <span>
                <span className="block dd-type-control font-semibold text-stone-900">Create account or log in</span>
                <span className="block dd-type-meta text-stone-500">Save lists and preferences</span>
              </span>
            </button>
          )}
        </div>

        {user && currentSpecialUnreadItemCount > 0 && (
          <Link
            href="/lists?updates=1"
            onClick={closeDrawer}
            aria-label={`Open Watchlist with ${currentSpecialUnreadItemCount} ${currentSpecialUnreadItemCount === 1 ? "update" : "updates"}`}
            className="mx-4 mb-3 flex min-h-12 items-center gap-2 rounded-2xl border border-alert-100 bg-alert-50 px-4 dd-type-control font-semibold text-alert-800 transition-colors hover:bg-alert-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-alert-600"
          >
              <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">Watchlist updates ({currentSpecialUnreadItemCount})</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-alert-600" aria-hidden="true" />
          </Link>
        )}

        <nav aria-label="Menu links" className="border-t border-stone-100 px-3 py-3">
          <Link href="/how-it-works" onClick={closeDrawer} className="flex min-h-14 items-center gap-3 rounded-xl px-3 dd-type-control text-stone-700 transition-colors hover:bg-stone-50">
            <span className="material-symbols-outlined text-[24px] leading-none text-stone-900" style={{ fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }} aria-hidden="true">
              help_center
            </span>
            How Dodgy Deal works
          </Link>
            <button type="button" onClick={() => { closeDrawer(); requestOnboardingTour(); }} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left dd-type-control text-stone-700 transition-colors hover:bg-stone-50">
              <span className="material-symbols-outlined text-[24px] leading-none text-stone-900" style={{ fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }} aria-hidden="true">
                play_circle
              </span>
              How to use Dodgy Deal
            </button>
          {canOpenDetectiveCase && (
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                requestDetectiveCaseOpen();
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left dd-type-control text-stone-700 transition-colors hover:bg-stone-50"
            >
              <Gamepad2 className="h-5 w-5 shrink-0 text-fair-700" aria-hidden="true" />
              Dodgy or not?
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              closeDrawer();
              requestPreviewOpen();
            }}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left dd-type-control text-stone-500 transition-colors hover:bg-stone-50"
          >
            <FlaskConical className="h-5 w-5 shrink-0 text-stone-700" aria-hidden="true" />
            New deals popup (test)
          </button>
          {!subscriptionLoading && !isPremium && (
            <Link href="/subscribe" onClick={closeDrawer} className="flex min-h-14 items-center gap-3 rounded-xl px-3 dd-type-control text-fair-800 transition-colors hover:bg-fair-50">
              <span className="material-symbols-outlined text-[24px] leading-none" style={{ fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }} aria-hidden="true">
                workspace_premium
              </span>
              Dodgy Deal Plus
            </Link>
          )}
          <Link href="/settings" onClick={navigateToSettings} className="flex min-h-14 items-center gap-3 rounded-xl px-3 dd-type-control text-stone-700 transition-colors hover:bg-stone-50">
            <span className="material-symbols-outlined text-[24px] leading-none text-stone-900" style={{ fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }} aria-hidden="true">
              settings
            </span>
            Settings
          </Link>
        </nav>
      </aside>
    </>
  );
}
