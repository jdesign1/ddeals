"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bell, ChevronDown, X } from "lucide-react";
import { getAccountDisplayName } from "@/lib/account-display";
import { useAuth } from "@/lib/auth-context";
import { useNavigationDrawer } from "@/lib/navigation-drawer-context";
import { useNotifications } from "@/lib/notifications-context";

function alertFreshnessLabel(createdAt: string): string | null {
  const ageHours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3_600_000);
  if (!Number.isFinite(ageHours) || ageHours < 1) return "verified just now";
  if (ageHours < 24) return `verified ${Math.floor(ageHours)}h ago`;
  if (ageHours < 48) return "verified yesterday";
  return null;
}

export default function AppDrawer() {
  const { isOpen, closeDrawer } = useNavigationDrawer();
  const { user, profile, loading, openAuthSheet, requestOnboardingTour } = useAuth();
  const { unreadCount, unreadAlerts } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

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

  return (
    <>
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
            className="flex h-11 w-11 items-center justify-center rounded-full text-stone-700 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 pb-4">
          {loading ? (
            <div className="h-[76px] animate-pulse rounded-2xl bg-stone-100" aria-label="Loading account" />
          ) : user ? (
            <div className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-fair-600 text-lg font-bold text-white">
                {avatarInitial}
              </span>
              <span className="min-w-0">
                <span className="block truncate dd-type-control font-semibold text-stone-900">{displayName}</span>
                <span className="block dd-type-meta text-stone-500">Deal detective</span>
              </span>
            </div>
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

        {user && unreadCount > 0 && (
          <div className="mx-4 mb-3 rounded-2xl border border-alert-100 bg-alert-50">
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((open) => !open)}
              aria-expanded={isNotificationsOpen}
              className="flex min-h-12 w-full items-center gap-2 px-4 text-left dd-type-control font-semibold text-alert-800"
            >
              <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">Watchlist updates ({unreadCount})</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-alert-600" aria-hidden="true" />
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isNotificationsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {isNotificationsOpen && (
              <div className="border-t border-alert-100 px-4 pb-3 pt-2">
                <p className="dd-type-meta leading-4 text-alert-800">
                  {unreadCount === 1 ? "One watched item has a new deal update." : `${unreadCount} watched items have new deal updates.`}
                </p>
                <ul className="mt-2 space-y-1.5" aria-label="Unread Watchlist updates">
                  {unreadAlerts.slice(0, 3).map((alert) => {
                    const freshness = alertFreshnessLabel(alert.created_at);
                    const message = alert.event_type === "dodgy_special"
                      ? `${alert.product_name} now looks dodgy at ${alert.store_name}`
                      : alert.verdict === "GENUINE"
                        ? `${alert.product_name} is a verified special at ${alert.store_name}`
                        : `${alert.product_name} has a better price at ${alert.store_name}`;
                    return (
                      <li key={alert.id} className="dd-type-meta leading-4 text-alert-800">
                        {message}{freshness ? ` (${freshness})` : ""}.
                      </li>
                    );
                  })}
                </ul>
                {unreadCount > 3 && <p className="mt-1 dd-type-meta text-alert-700">Plus {unreadCount - 3} more updates.</p>}
                <Link href="/lists" onClick={closeDrawer} className="mt-2 inline-flex dd-type-meta font-bold text-alert-800 underline decoration-alert-300 underline-offset-2">
                  Review Watchlist
                </Link>
              </div>
            )}
          </div>
        )}

        <nav aria-label="Menu links" className="border-t border-stone-100 px-3 py-3">
          <Link href="/how-it-works" onClick={closeDrawer} className="flex min-h-14 items-center gap-3 rounded-xl px-3 dd-type-control text-stone-700 transition-colors hover:bg-stone-50">
            <span className="material-symbols-outlined text-[24px] leading-none text-stone-900" style={{ fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }} aria-hidden="true">
              help_center
            </span>
            How Dodgy Deal works
          </Link>
          {user && (
            <button type="button" onClick={() => { closeDrawer(); requestOnboardingTour(); }} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left dd-type-control text-stone-700 transition-colors hover:bg-stone-50">
              <span className="material-symbols-outlined text-[24px] leading-none text-stone-900" style={{ fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }} aria-hidden="true">
                play_circle
              </span>
              How to use Dodgy Deal
            </button>
          )}
          <Link href="/settings" onClick={closeDrawer} className="flex min-h-14 items-center gap-3 rounded-xl px-3 dd-type-control text-stone-700 transition-colors hover:bg-stone-50">
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
