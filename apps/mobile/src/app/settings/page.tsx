"use client";

import Link from "next/link";
import { Bell, ChevronRight, CircleHelp, CreditCard, ExternalLink, LoaderCircle, Pencil, Palette, ShieldCheck, Trash2, UserRound, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCardLayout } from "@/lib/card-layout-context";
import { useTheme } from "@/lib/theme-context";
import { usePageHeader } from "@/lib/header-context";
import { useAuth, type AccountProfileUpdate } from "@/lib/auth-context";
import { PUBLIC_PROFILE_QUOTE_CONTACT_ERROR } from "@/lib/public-profile-fields";
import { getAccountDisplayName, getAccountEmailDisplay, getAccountSignInMethodDisplay } from "@/lib/account-display";
import { captureSettingsScrollPosition } from "@/lib/scroll-events";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CommunityProfileDetails from "@/components/CommunityProfileDetails";
import CommunityProfileSummary from "@/components/CommunityProfileSummary";
import MascotImage from "@/components/MascotImage";
import IdentityLinkingPanel from "@/components/IdentityLinkingPanel";
import { useNotifications } from "@/lib/notifications-context";
import { useSubscriptions } from "@/lib/subscription-context";
import { useNavigationDrawer } from "@/lib/navigation-drawer-context";
import {
  formatSubscriptionDate,
  getSubscriptionRenewalLabel,
} from "@/lib/subscription-display";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const SETTINGS_TRANSITION_MS = 320;

const CARD_LAYOUT_OPTIONS = [
  { value: "grid" as const, label: "Grid", detail: "Two across" },
  { value: "single" as const, label: "Big cards", detail: "One across" },
  { value: "compact" as const, label: "Compact", detail: "Less height" },
];

const SETTINGS_SECONDARY_BUTTON_CLASS = "inline-flex min-h-11 w-fit cursor-pointer items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-bold text-ink-800 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 disabled:cursor-not-allowed disabled:opacity-60";
const SETTINGS_ALERT_BUTTON_CLASS = "inline-flex min-h-11 w-fit cursor-pointer items-center justify-center gap-2 rounded-full border border-alert-200 bg-white px-4 text-sm font-bold text-alert-600 transition-colors hover:bg-alert-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-alert-200 disabled:cursor-not-allowed disabled:opacity-60";

function SettingsSection({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-stone-200/80 bg-white p-4" aria-labelledby={id}>
      <div className="flex items-center gap-3 px-1">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-fair-50 text-fair-700 ring-1 ring-fair-100">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="dd-type-section text-stone-900">{title}</h2>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function useSettingsDialogA11y(open: boolean, close: () => void, dialogId: string, initialFocusId: string) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => document.getElementById(initialFocusId)?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.getElementById(dialogId);
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) previousFocusRef.current.focus();
    };
  }, [dialogId, initialFocusId, open]);
}

function formatMemberSince(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-NZ", { year: "numeric", month: "long", day: "numeric" });
}

function ProfileDetailsSheet({
  isOpen,
  profileName,
  profileInitial,
  accountIdentifier,
  isPremium,
  subscriptionLoading,
  createdAt,
  city,
  favoriteStoreBranch,
  quote,
  prefersReducedMotion,
  onClose,
  onEdit,
}: {
  isOpen: boolean;
  profileName: string;
  profileInitial: string;
  accountIdentifier: string;
  isPremium: boolean;
  subscriptionLoading: boolean;
  createdAt?: string;
  city?: string | null;
  favoriteStoreBranch?: string | null;
  quote?: string | null;
  prefersReducedMotion: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <BottomSheetPortal open={isOpen}>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close profile details"
              className="dd-bottom-sheet-backdrop fixed inset-0 mx-auto w-full max-w-[480px] bg-stone-950/75"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : undefined}
            />
            <motion.section
              id="settings-profile-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-profile-sheet-title"
              className="dd-bottom-sheet fixed inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl text-white shadow-2xl"
              style={{ backgroundColor: "var(--color-ink-950)" }}
              initial={prefersReducedMotion ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={prefersReducedMotion ? undefined : { y: "100%" }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-white/10 px-5 py-4" style={{ backgroundColor: "var(--color-ink-950)" }}>
                <h2 id="settings-profile-sheet-title" className="dd-type-sheet-title text-white">Your profile</h2>
                <button
                  type="button"
                  id="settings-profile-close"
                  onClick={onClose}
                  aria-label="Close"
                  className="dd-bottom-sheet-close text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-fair-300"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-fair-400 text-ink-950 ring-4 ring-fair-300/30 shadow-lg">
                    <span className="font-display text-4xl font-extrabold" aria-hidden="true">{profileInitial}</span>
                  </div>
                  <div className="mt-4 flex max-w-full items-center justify-center gap-2">
                    <h3 className="max-w-[75%] truncate dd-type-section text-white">{profileName}</h3>
                    {!subscriptionLoading && isPremium && <span className="shrink-0 rounded-full bg-fair-400 px-2.5 py-1 dd-type-badge text-ink-950">Plus</span>}
                  </div>
                  <p className="mt-1 max-w-full truncate dd-type-secondary text-white/65">{accountIdentifier}</p>
                </div>

                <div className="mt-6 grid grid-cols-2 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/5 py-4">
                  <div className="px-4 text-center">
                    <p className="dd-type-meta dd-type-meta-strong uppercase tracking-[0.08em] text-white/50">Member since</p>
                    <p className="mt-1 dd-type-control text-white">{formatMemberSince(createdAt)}</p>
                  </div>
                  <div className="px-4 text-center">
                    <p className="dd-type-meta dd-type-meta-strong uppercase tracking-[0.08em] text-white/50">Plan</p>
                    <p className="mt-1 dd-type-control text-white">
                      {subscriptionLoading ? "Checking…" : isPremium ? "Dodgy Deal Plus" : "Free account"}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <CommunityProfileSummary variant="dark" />
                </div>

                <CommunityProfileDetails city={city} favoriteStoreBranch={favoriteStoreBranch} quote={quote} isDark />

                <button type="button" onClick={onEdit} className="dd-btn dd-btn-primary mt-5 min-h-14 w-full cursor-pointer">
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit profile
                </button>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { isTransitioningToSettings, completeSettingsNavigation } = useNavigationDrawer();
  const { cardLayout, setCardLayout } = useCardLayout();
  const { isDarkMode, setTheme } = useTheme();
  const { user, session, profile, loading: authLoading, signOut, updateProfile, openAuthSheet } = useAuth();
  const {
    pushEnabled,
    pushReady,
    pushAvailableOnDevice,
    pushPermissionState,
    notificationError,
    setPushEnabled,
    openNotificationSettings,
  } = useNotifications();
  const {
    isPremium,
    loading: subscriptionLoading,
    currentSubscription,
    openSubscriptionPage,
    isNativeAvailable,
    restoring,
    restore,
  } = useSubscriptions();
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isLogoutSheetOpen, setIsLogoutSheetOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false);
  const [isProfileEditSheetOpen, setIsProfileEditSheetOpen] = useState(false);
  const [profileEditDraft, setProfileEditDraft] = useState<AccountProfileUpdate>({
    full_name: "",
    city: "",
    favorite_store_branch: "",
    profile_quote: "",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [profileEditError, setProfileEditError] = useState<string | null>(null);
  const [isDeleteSheetOpen, setIsDeleteSheetOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [appleSignInUsed, setAppleSignInUsed] = useState(false);
  const [isFinishingDeletion, setIsFinishingDeletion] = useState(false);
  const backNavigationStartedRef = useRef(false);
  const profileEditTimeoutRef = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (isTransitioningToSettings && prefersReducedMotion) completeSettingsNavigation();
  }, [completeSettingsNavigation, isTransitioningToSettings, prefersReducedMotion]);

  useSettingsDialogA11y(isDeleteSheetOpen, () => {
    if (!isDeletingAccount && !accountDeleted) setIsDeleteSheetOpen(false);
  }, "settings-delete-account-dialog", "settings-delete-account-close");
  useSettingsDialogA11y(isLogoutSheetOpen, () => setIsLogoutSheetOpen(false), "settings-logout-dialog", "settings-logout-close");
  useSettingsDialogA11y(isProfileSheetOpen, () => setIsProfileSheetOpen(false), "settings-profile-dialog", "settings-profile-close");
  useSettingsDialogA11y(isProfileEditSheetOpen, () => setIsProfileEditSheetOpen(false), "settings-edit-profile-dialog", "settings-profile-name-input");

  useEffect(() => () => {
    if (profileEditTimeoutRef.current !== null) window.clearTimeout(profileEditTimeoutRef.current);
  }, []);

  const profileName = user ? getAccountDisplayName(user, profile) : "Dodgy Deal shopper";
  const profileInitial = profileName.trim().charAt(0).toUpperCase() || "D";
  const accountEmail = getAccountEmailDisplay(user?.email);
  const accountSignInMethod = getAccountSignInMethodDisplay(user);
  const accountIdentifier = accountEmail === "-" ? accountSignInMethod : accountEmail;

  const onBack = () => {
    if (backNavigationStartedRef.current) return;
    backNavigationStartedRef.current = true;
    setIsNavigatingBack(true);
    window.setTimeout(() => router.back(), prefersReducedMotion ? 0 : SETTINGS_TRANSITION_MS);
  };

  usePageHeader("Settings", onBack);

  const handleEntryTransitionComplete = () => {
    if (!isNavigatingBack && isTransitioningToSettings) completeSettingsNavigation();
  };

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await signOut();
      setIsLogoutSheetOpen(false);
      router.replace("/");
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function handleDeleteAccount() {
    const accessToken = session?.access_token;
    if (!accessToken) {
      setAccountDeleteError("Your session has expired. Please sign in again, then try deleting your account.");
      return;
    }

    setAccountDeleteError(null);
    setIsDeletingAccount(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; appleSignInUsed?: boolean } | null;
      if (!response.ok || result?.ok !== true) {
        setAccountDeleteError(result?.error ?? "We couldn't delete your account just now. Please try again.");
        return;
      }
      setAppleSignInUsed(result?.appleSignInUsed === true);
      setAccountDeleted(true);
    } catch {
      setAccountDeleteError("We couldn't delete your account just now. Check your connection and try again.");
    } finally {
      setIsDeletingAccount(false);
    }
  }

  async function finishAccountDeletion() {
    setIsFinishingDeletion(true);
    try {
      await signOut();
    } finally {
      setIsDeleteSheetOpen(false);
      router.replace("/");
    }
  }

  function openProfileEditSheet() {
    setProfileEditDraft({
      full_name: profile?.full_name?.trim() || "",
      city: profile?.city?.trim() || "",
      favorite_store_branch: profile?.favorite_store_branch?.trim() || "",
      profile_quote: profile?.profile_quote?.trim() || "",
    });
    setProfileEditError(null);
    setIsProfileEditSheetOpen(true);
  }

  function openProfileEditSheetFromProfile() {
    setIsProfileSheetOpen(false);
    if (profileEditTimeoutRef.current !== null) window.clearTimeout(profileEditTimeoutRef.current);
    profileEditTimeoutRef.current = window.setTimeout(() => {
      profileEditTimeoutRef.current = null;
      openProfileEditSheet();
    }, prefersReducedMotion ? 0 : SETTINGS_TRANSITION_MS);
  }

  async function handleSaveProfile() {
    const trimmedName = profileEditDraft.full_name.trim();
    if (!trimmedName) {
      setProfileEditError("Enter your name.");
      return;
    }
    setProfileEditError(null);
    setIsSavingProfile(true);
    try {
      const result = await updateProfile({ ...profileEditDraft, full_name: trimmedName });
      if (result.error) {
        setProfileEditError(result.error === PUBLIC_PROFILE_QUOTE_CONTACT_ERROR
          ? result.error
          : "We couldn't update your profile. Please try again.");
        return;
      }
      setIsProfileEditSheetOpen(false);
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePushToggle() {
    setIsSavingNotifications(true);
    try {
      await setPushEnabled(!pushEnabled);
    } finally {
      setIsSavingNotifications(false);
    }
  }

  async function handleEnableNotifications() {
    setIsSavingNotifications(true);
    try {
      await setPushEnabled(true);
    } finally {
      setIsSavingNotifications(false);
    }
  }

  async function handleOpenNotificationSettings() {
    setIsSavingNotifications(true);
    try {
      await openNotificationSettings();
    } finally {
      setIsSavingNotifications(false);
    }
  }

  const notificationPermissionDenied = pushPermissionState === "denied";
  const canManagePushNotifications = Boolean(user && pushAvailableOnDevice && pushReady);
  const pushNotificationDescription = !user
    ? "Sign in to turn on list updates."
    : !pushAvailableOnDevice
      ? "Push notifications are available in the iOS app."
      : !pushReady
        ? "Server setup is needed before push notifications can be enabled."
        : notificationPermissionDenied
          ? "Notifications are blocked in iPhone Settings. Turn them on there to receive list updates."
          : pushPermissionState === null
            ? "Checking notification access on this iPhone."
            : pushPermissionState !== "granted"
              ? "Turn on notifications to get meaningful list price updates."
              : pushEnabled
                ? "Updates are grouped by list. You can turn these off anytime."
                : "Only meaningful price changes will send an update.";

  return (
    <>
      <motion.main
        initial={prefersReducedMotion ? false : { opacity: 0, x: "4%" }}
        animate={isNavigatingBack ? { opacity: 0, x: "100%" } : { opacity: 1, x: 0 }}
        onAnimationComplete={handleEntryTransitionComplete}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: SETTINGS_TRANSITION_MS / 1000, ease: "easeOut" }}
        className="relative z-[47] min-h-full w-full flex flex-col gap-4 bg-stone-100 px-4 py-4 pb-10"
      >
      <h1 className="sr-only">Settings</h1>
      {!authLoading && (
        <section className="relative overflow-hidden rounded-3xl border border-ink-900 bg-ink-950 px-5 pb-5 pt-6 text-white" aria-labelledby="settings-profile-title">
          <div className="relative flex flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-fair-400 text-ink-950 ring-4 ring-fair-200/40 shadow-lg">
              <span className="font-display text-4xl font-extrabold" aria-hidden="true">
                {user ? profileInitial : "D"}
              </span>
            </div>
            <div className="mt-4 flex w-full items-center justify-center gap-2">
              <h2 id="settings-profile-title" className="max-w-[75%] truncate dd-type-section text-white">
                {user ? profileName : "Your Dodgy Deal profile"}
              </h2>
              {user && !subscriptionLoading && isPremium && (
                <span className="shrink-0 rounded-full bg-fair-100 px-2.5 py-1 dd-type-badge text-fair-800">Plus</span>
              )}
            </div>
            <p className="mt-1 max-w-full truncate dd-type-secondary text-stone-300">
              {user ? accountIdentifier : "Sign in to save Watchlist items and price alerts"}
            </p>
            {user ? (
              <button
                type="button"
                onClick={() => setIsProfileSheetOpen(true)}
                aria-label="See more profile details"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 dd-type-control text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-fair-300"
              >
                <span>See more</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthSheet("Sign in to manage your Dodgy Deal profile.")}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-fair-400 px-5 dd-type-control text-ink-950 transition-colors hover:bg-fair-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-fair-300"
              >
                <UserRound className="h-4 w-4" aria-hidden="true" />
                Sign in or create account
              </button>
            )}
          </div>
        </section>
      )}

      <SettingsSection id="settings-display-title" icon={Palette} title="Display">
        <div className="rounded-2xl bg-stone-50 p-4">
          <div className="mb-3">
            <p className="dd-type-control text-stone-900">Card layout</p>
            <p className="mt-1 dd-type-meta text-stone-500">
              {cardLayout === "grid"
                ? "Grid layout — two cards per row"
                : cardLayout === "single"
                  ? "Big cards layout — one card per row"
                  : "See more items at once"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Card layout">
            {CARD_LAYOUT_OPTIONS.map((option) => {
              const isSelected = cardLayout === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  id={`settings-card-layout-${option.value}`}
                  onKeyDown={(event) => {
                    const currentIndex = CARD_LAYOUT_OPTIONS.findIndex((item) => item.value === option.value);
                    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                    if (!direction) return;
                    event.preventDefault();
                    const nextOption = CARD_LAYOUT_OPTIONS[(currentIndex + direction + CARD_LAYOUT_OPTIONS.length) % CARD_LAYOUT_OPTIONS.length];
                    setCardLayout(nextOption.value);
                    window.requestAnimationFrame(() => document.getElementById(`settings-card-layout-${nextOption.value}`)?.focus());
                  }}
                  onClick={() => setCardLayout(option.value)}
                  className={`relative flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-[background-color,border-color,box-shadow,transform] duration-300 ease-out motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 ${
                    isSelected
                      ? "scale-[1.01] border-fair-400 bg-fair-50 text-ink-900 ring-2 ring-fair-200 shadow-sm"
                      : "scale-100 border-stone-200 bg-white text-stone-600 hover:border-ink-300 hover:bg-stone-50"
                  }`}
                >
                  <span className="dd-type-control">{option.label}</span>
                  <span className="mt-0.5 dd-type-meta">{option.detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 p-4">
          <div>
            <p className="dd-type-control text-stone-900">
              {isDarkMode ? "Dark mode" : "Light mode"}
            </p>
            <p className="mt-1 dd-type-meta text-stone-500">
              {isDarkMode ? "A darker appearance for low light" : "A lighter appearance for daytime"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDarkMode}
            aria-label="Dark mode"
            onClick={() => setTheme(isDarkMode ? "light" : "dark")}
            className="inline-flex h-11 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
          >
            <span className={`settings-display-switch relative inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${isDarkMode ? "bg-ink-600" : "bg-stone-300"}`} aria-hidden="true">
              <span className={`theme-switch-thumb h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isDarkMode ? "translate-x-5" : "translate-x-0"}`} />
            </span>
          </button>
        </div>
      </SettingsSection>

      <SettingsSection id="settings-notifications-title" icon={Bell} title="Notifications">
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-stone-50 p-4">
          <div className="min-w-0">
            <p className="dd-type-control text-stone-900">Push notifications</p>
            <p className="mt-1 dd-type-meta leading-5 text-stone-500">{pushNotificationDescription}</p>
          </div>
          {canManagePushNotifications && pushPermissionState === "granted" && (
            <button
              type="button"
              role="switch"
              aria-checked={pushEnabled}
              aria-label="Push notifications"
              disabled={authLoading || isSavingNotifications}
              onClick={() => void handlePushToggle()}
              className="inline-flex h-11 w-12 flex-shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`settings-display-switch relative inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${pushEnabled ? "bg-ink-600" : "bg-stone-300"}`} aria-hidden="true">
                <span className={`theme-switch-thumb h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${pushEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>
          )}
        </div>
        {canManagePushNotifications && pushPermissionState !== "granted" && (
          <button
            type="button"
            disabled={authLoading || isSavingNotifications}
            onClick={() => void (notificationPermissionDenied ? handleOpenNotificationSettings() : handleEnableNotifications())}
            className={`${SETTINGS_SECONDARY_BUTTON_CLASS} text-left text-ink-700`}
          >
            <span>{notificationPermissionDenied ? "Open iPhone Settings" : "Enable notifications"}</span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
          </button>
        )}
        {notificationError && <p role="status" className="mt-3 dd-type-secondary text-alert-700">{notificationError}</p>}
      </SettingsSection>

      <SettingsSection id="settings-legal-title" icon={ShieldCheck} title="Legal">
        <Link
          href="/privacy"
          className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 p-4 dd-type-control text-stone-800 transition-colors hover:bg-stone-100"
        >
          <span>
            <span className="block">Privacy policy</span>
            <span className="mt-1 block dd-type-meta text-stone-500">
              Collection, use, storage, and your privacy rights
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <Link
          href="/terms"
          className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 p-4 dd-type-control text-stone-800 transition-colors hover:bg-stone-100"
        >
          <span>
            <span className="block">Terms of use</span>
            <span className="mt-1 block dd-type-meta text-stone-500">
              Rules for using Dodgy Deal
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
      </SettingsSection>

      <SettingsSection id="settings-help-title" icon={CircleHelp} title="Help">
        <Link
          href="/support"
          onClick={captureSettingsScrollPosition}
          className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 p-4 dd-type-control text-stone-800 transition-colors hover:bg-stone-100"
        >
          <span>
            <span className="block">Contact support</span>
            <span className="mt-1 block dd-type-meta text-stone-500">
              Get help with the app
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <Link
          href="/report-deal"
          onClick={captureSettingsScrollPosition}
          className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 p-4 dd-type-control text-stone-800 transition-colors hover:bg-stone-100"
        >
          <span>
            <span className="block">Report an incorrect deal</span>
            <span className="mt-1 block dd-type-meta text-stone-500">
              Help us keep prices and specials accurate
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 p-4 dd-type-control text-stone-800">
          <span>
            <span className="block">App version</span>
            <span className="mt-1 block dd-type-meta text-stone-500">
              Dodgy Deal mobile app
            </span>
          </span>
          <span className="dd-type-meta dd-type-meta-strong tabular-nums text-stone-500">0.1.0</span>
        </div>
      </SettingsSection>

      {!authLoading && user && (
        <SettingsSection id="settings-account-title" icon={CreditCard} title="Account">
          <div className="flex flex-col gap-3">
            <div className={`flex flex-col overflow-hidden rounded-2xl bg-stone-50 p-4 ${subscriptionLoading ? "h-[22rem]" : ""}`} aria-labelledby="settings-subscription-title" aria-busy={subscriptionLoading}>
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div>
                  <p className="dd-type-meta dd-type-meta-strong text-stone-500">Subscription</p>
                  <p id="settings-subscription-title" className="mt-0.5 dd-type-secondary dd-type-secondary-strong text-stone-900">
                    {subscriptionLoading
                      ? "Checking subscription…"
                      : isPremium && currentSubscription
                        ? "Dodgy Deal Plus"
                        : "Free account"}
                  </p>
                </div>
                {!subscriptionLoading && isPremium && currentSubscription && (
                  <span className="shrink-0 rounded-full bg-fair-100 px-2.5 py-1 dd-type-badge text-fair-800">Active</span>
                )}
              </div>
              <div className={subscriptionLoading ? "min-h-0 flex-1" : ""}>
                {subscriptionLoading ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
                    <LoaderCircle className="h-5 w-5 animate-spin text-stone-500" aria-hidden="true" />
                    <span className="dd-type-meta text-stone-500">Checking Apple subscription…</span>
                  </div>
                ) : isPremium && currentSubscription ? (
                  <>
                    <div className="mt-3 space-y-1 dd-type-meta text-stone-600">
                      {formatSubscriptionDate(currentSubscription.expires_at) && (
                        <p>Access until {formatSubscriptionDate(currentSubscription.expires_at)}</p>
                      )}
                      <p>{getSubscriptionRenewalLabel(currentSubscription.product_id)}.</p>
                    </div>
                    <a
                      href={APPLE_SUBSCRIPTIONS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className={`${SETTINGS_SECONDARY_BUTTON_CLASS} mt-4`}
                    >
                      <span>Manage in Apple</span>
                      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </a>
                    <p className="mt-2 dd-type-meta text-stone-500">Cancellation takes effect at the end of your current billing period.</p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 dd-type-secondary text-stone-600">Save up to 5 Watchlist items with a free account. Subscribe to unlock unlimited items and price alerts.</p>
                    <button
                      type="button"
                      onClick={openSubscriptionPage}
                      className={`${SETTINGS_SECONDARY_BUTTON_CLASS} mt-3`}
                    >
                      See subscription options
                    </button>
                    {isNativeAvailable && (
                      <div className="mt-3 border-t border-stone-200 pt-3">
                        <p className="dd-type-meta text-stone-500">Already subscribed through Apple but not seeing access? We normally check automatically.</p>
                        <button
                          type="button"
                          onClick={() => void restore()}
                          disabled={restoring}
                          className={`${SETTINGS_SECONDARY_BUTTON_CLASS} mt-2`}
                          aria-busy={restoring}
                        >
                          {restoring ? "Checking Apple purchases…" : "Check Apple purchases"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <IdentityLinkingPanel />
            <button
              type="button"
              onClick={() => setIsLogoutSheetOpen(true)}
              className={`${SETTINGS_ALERT_BUTTON_CLASS} mt-1`}
            >
              Log out
            </button>
          </div>
        </SettingsSection>
      )}

      {!authLoading && user && (
        <section className="rounded-3xl border border-alert-100 bg-white p-4" aria-labelledby="settings-danger-zone-title">
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-alert-50 text-alert-700 ring-1 ring-alert-100">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="settings-danger-zone-title" className="dd-type-section text-alert-700">Danger zone</h2>
            </div>
          </div>
          <p className="mt-4 dd-type-secondary text-stone-600">
            This permanently deletes your profile, saved lists, and browsing history. You can&apos;t undo this.
          </p>
          <button
            type="button"
            onClick={() => {
              setAccountDeleteError(null);
              setAccountDeleted(false);
              setIsDeleteSheetOpen(true);
            }}
            className={`${SETTINGS_ALERT_BUTTON_CLASS} mt-4`}
          >
            Delete account
          </button>
        </section>
      )}

      <ProfileDetailsSheet
        isOpen={isProfileSheetOpen}
        profileName={profileName}
        profileInitial={profileInitial}
        accountIdentifier={accountIdentifier}
        isPremium={isPremium}
        subscriptionLoading={subscriptionLoading}
        createdAt={user?.created_at}
        city={profile?.city}
        favoriteStoreBranch={profile?.favorite_store_branch}
        quote={profile?.profile_quote}
        prefersReducedMotion={Boolean(prefersReducedMotion)}
        onClose={() => setIsProfileSheetOpen(false)}
        onEdit={openProfileEditSheetFromProfile}
      />

      <BottomSheetPortal open={isDeleteSheetOpen}>
        <AnimatePresence>
          {isDeleteSheetOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close delete account confirmation"
                disabled={isDeletingAccount || accountDeleted}
                className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
                onClick={() => {
                  if (!isDeletingAccount && !accountDeleted) setIsDeleteSheetOpen(false);
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.section
                id="settings-delete-account-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-delete-account-title"
                aria-describedby="settings-delete-account-description"
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[48vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                  <h2 id="settings-delete-account-title" className="dd-type-sheet-title text-stone-900">
                    {accountDeleted ? "Account deleted" : "Delete your account?"}
                  </h2>
                  {!isDeletingAccount && !accountDeleted && (
                    <button
                      type="button"
                      id="settings-delete-account-close"
                      onClick={() => setIsDeleteSheetOpen(false)}
                      aria-label="Close"
                      className="dd-bottom-sheet-close text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 px-5 py-4 pb-safe-sm">
                  <div className="flex justify-center">
                    <MascotImage
                      src="/auth-wave.webp"
                      darkSrc="/auth-wave-dark.webp"
                      alt="Dodgy Deal mascot waving"
                      width={192}
                      height={222}
                      sizes="112px"
                      unoptimized
                      className="mascot-wave h-auto w-24"
                    />
                  </div>
                  {accountDeleted ? (
                    <>
                      <p id="settings-delete-account-description" className="dd-type-body text-stone-600">
                        Your Dodgy Deal account and saved data have been deleted.
                      </p>
                      {appleSignInUsed && (
                        <p className="dd-type-secondary text-stone-600">
                          To also remove Sign in with Apple access, open iPhone Settings, tap your name, then Sign in with Apple. Select Dodgy Deal and tap Delete.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void finishAccountDeletion()}
                        disabled={isFinishingDeletion}
                        className="dd-btn dd-btn-primary mt-auto w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isFinishingDeletion ? "Signing out…" : "Done"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p id="settings-delete-account-description" className="dd-type-body text-stone-600">
                        Your profile, saved lists, and browsing history will be permanently deleted. This can&apos;t be undone.
                      </p>
                      {accountDeleteError && (
                        <p role="alert" className="dd-type-secondary text-alert-700">{accountDeleteError}</p>
                      )}
                      <div className="mt-auto flex flex-col gap-3 pt-4">
                        <button
                          type="button"
                          onClick={() => setIsDeleteSheetOpen(false)}
                          disabled={isDeletingAccount}
                          className="dd-btn dd-btn-outline-muted w-full cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAccount()}
                          disabled={isDeletingAccount}
                          className="dd-btn dd-btn-outline-alert w-full cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isDeletingAccount ? "Deleting account…" : "Delete account"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>

      <BottomSheetPortal open={isLogoutSheetOpen}>
        <AnimatePresence>
          {isLogoutSheetOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close log out confirmation"
                className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
                onClick={() => setIsLogoutSheetOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.section
                id="settings-logout-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-logout-sheet-title"
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                  <h2 id="settings-logout-sheet-title" className="dd-type-sheet-title text-stone-900">Log out?</h2>
                  <button
                    type="button"
                    id="settings-logout-close"
                    onClick={() => setIsLogoutSheetOpen(false)}
                    aria-label="Close"
                    className="dd-bottom-sheet-close text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-3 px-5 py-4 pb-safe-sm">
                  <div className="flex justify-center">
                    <MascotImage
                      src="/auth-wave.webp"
                      darkSrc="/auth-wave-dark.webp"
                      alt="Dodgy Deal mascot waving"
                      width={192}
                      height={222}
                      sizes="112px"
                      unoptimized
                      className="mascot-wave h-auto w-24"
                    />
                  </div>
                  <p className="dd-type-body text-stone-600">Are you sure you want to log out of Dodgy Deal?</p>
                  <div className="mt-auto flex flex-col gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsLogoutSheetOpen(false)}
                      disabled={isLoggingOut}
                      className="dd-btn dd-btn-outline-muted w-full cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="dd-btn dd-btn-outline-alert w-full cursor-pointer"
                    >
                      {isLoggingOut ? "Logging out…" : "Log out"}
                    </button>
                  </div>
                </div>
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>

      <BottomSheetPortal open={isProfileEditSheetOpen}>
        <AnimatePresence>
          {isProfileEditSheetOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close edit profile sheet"
                className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
                onClick={() => setIsProfileEditSheetOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.section
                id="settings-edit-profile-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-edit-profile-sheet-title"
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                  <h2 id="settings-edit-profile-sheet-title" className="dd-type-sheet-title text-stone-900">Edit your profile</h2>
                  <button
                    type="button"
                    onClick={() => setIsProfileEditSheetOpen(false)}
                    aria-label="Close"
                    className="dd-bottom-sheet-close text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSaveProfile();
                  }}
                  className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-safe-sm"
                >
                  <p className="dd-type-secondary text-stone-600">These optional details appear on your public shopper profile. Leave anything blank to hide it.</p>
                  <label className="mt-4 flex flex-col gap-1.5">
                    <span className="dd-type-meta dd-type-meta-strong text-stone-500">Name</span>
                    <input
                      id="settings-profile-name-input"
                      type="text"
                      value={profileEditDraft.full_name}
                      onChange={(event) => setProfileEditDraft((current) => ({ ...current, full_name: event.target.value }))}
                      placeholder="Enter your name"
                      autoComplete="name"
                      autoFocus
                      disabled={isSavingProfile}
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-stone-700 placeholder:text-stone-500 focus:border-stone-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                    />
                  </label>
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="dd-type-meta dd-type-meta-strong text-stone-500">City <span className="font-normal text-stone-400">(optional)</span></span>
                    <input
                      type="text"
                      value={profileEditDraft.city}
                      onChange={(event) => setProfileEditDraft((current) => ({ ...current, city: event.target.value }))}
                      placeholder="e.g. Auckland"
                      autoComplete="address-level2"
                      maxLength={60}
                      disabled={isSavingProfile}
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-stone-700 placeholder:text-stone-500 focus:border-stone-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                    />
                  </label>
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="dd-type-meta dd-type-meta-strong text-stone-500">Fave supermarket branch <span className="font-normal text-stone-400">(optional)</span></span>
                    <input
                      type="text"
                      value={profileEditDraft.favorite_store_branch}
                      onChange={(event) => setProfileEditDraft((current) => ({ ...current, favorite_store_branch: event.target.value }))}
                      placeholder="e.g. Ponsonby"
                      maxLength={80}
                      disabled={isSavingProfile}
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-stone-700 placeholder:text-stone-500 focus:border-stone-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                    />
                  </label>
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="dd-type-meta dd-type-meta-strong text-stone-500">Quote <span className="font-normal text-stone-400">(optional)</span></span>
                    <textarea
                      value={profileEditDraft.profile_quote}
                      onChange={(event) => setProfileEditDraft((current) => ({ ...current, profile_quote: event.target.value }))}
                      placeholder="Your best grocery wisdom…"
                      maxLength={160}
                      rows={3}
                      disabled={isSavingProfile}
                      className="w-full resize-none rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-stone-700 placeholder:text-stone-500 focus:border-stone-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                    />
                    <span className="dd-type-meta text-stone-400">Keep it fun and skip contact details.</span>
                  </label>
                  {profileEditError && <p className="mt-3 dd-type-secondary text-alert-600">{profileEditError}</p>}
                  <button
                    type="submit"
                    disabled={isSavingProfile || !profileEditDraft.full_name.trim()}
                    className="dd-btn dd-btn-primary mt-5 w-full cursor-pointer"
                  >
                    {isSavingProfile ? "Saving…" : "Save profile"}
                  </button>
                </form>
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>
      </motion.main>
    </>
  );
}
