"use client";

import Link from "next/link";
import { ChevronRight, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useCardLayout } from "@/lib/card-layout-context";
import { useTheme } from "@/lib/theme-context";
import { usePageHeader } from "@/lib/header-context";
import { useAuth } from "@/lib/auth-context";
import { getAccountDisplayName, getAccountEmailDisplay } from "@/lib/account-display";
import { captureSettingsScrollPosition } from "@/lib/scroll-events";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import MascotImage from "@/components/MascotImage";
import { useNotifications } from "@/lib/notifications-context";

const CARD_LAYOUT_OPTIONS = [
  { value: "grid" as const, label: "Grid", detail: "Two across" },
  { value: "single" as const, label: "Single", detail: "Larger cards" },
  { value: "compact" as const, label: "Compact", detail: "Short cards" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { cardLayout, setCardLayout } = useCardLayout();
  const { isDarkMode, setTheme } = useTheme();
  const { user, session, profile, loading: authLoading, signOut, updateProfileName } = useAuth();
  const {
    pushEnabled,
    pushReady,
    pushAvailableOnDevice,
    pushPermissionState,
    notificationError,
    setPushEnabled,
    openNotificationSettings,
  } = useNotifications();
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isLogoutSheetOpen, setIsLogoutSheetOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isNameSheetOpen, setIsNameSheetOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isDeleteSheetOpen, setIsDeleteSheetOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [appleSignInUsed, setAppleSignInUsed] = useState(false);
  const [isFinishingDeletion, setIsFinishingDeletion] = useState(false);
  const backNavigationStartedRef = useRef(false);

  const profileName = user ? getAccountDisplayName(user, profile) : "Dodgy Deal shopper";
  const profileInitial = profileName.trim().charAt(0).toUpperCase() || "D";
  const accountEmail = getAccountEmailDisplay(user?.email);

  const onBack = () => {
    if (backNavigationStartedRef.current) return;
    backNavigationStartedRef.current = true;
    setIsNavigatingBack(true);
    window.setTimeout(() => router.back(), 280);
  };

  usePageHeader("Settings", onBack);

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

  function openNameSheet() {
    setNameDraft(profile?.full_name?.trim() || "");
    setNameError(null);
    setIsNameSheetOpen(true);
  }

  async function handleSaveName() {
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setNameError("Enter your name.");
      return;
    }
    setNameError(null);
    setIsSavingName(true);
    try {
      const result = await updateProfileName(trimmedName);
      if (result.error) {
        setNameError("We couldn't update your name. Please try again.");
        return;
      }
      setIsNameSheetOpen(false);
    } finally {
      setIsSavingName(false);
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
    <motion.main
      initial={{ x: "100%" }}
      animate={{ x: isNavigatingBack ? "100%" : 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-full w-full flex flex-col gap-4 px-5 py-5 pb-10"
    >
      {!authLoading && user && (
        <section className="rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="settings-profile-title">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-fair-50 ring-1 ring-fair-200">
              <span className="font-display text-2xl font-extrabold text-fair-700" aria-hidden="true">
                {profileInitial}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="settings-profile-title" className="min-w-0 truncate font-display text-[19px] font-extrabold leading-6 text-stone-900">
                  {profileName}
                </h2>
                <button
                  type="button"
                  onClick={openNameSheet}
                  aria-label="Edit your name"
                  className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 truncate dd-type-secondary text-stone-500">{accountEmail}</p>
            </div>
          </div>
          <div className="mt-5 border-t border-stone-100 pt-4">
            <p className="dd-type-meta dd-type-meta-strong text-stone-500">Profile</p>
            <p className="mt-1 dd-type-secondary text-stone-600">Your Dodgy Deal shopper profile</p>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h1 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Display</h1>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Choose how the app and deal cards are displayed.
          </p>
        </div>

        <div className="border-t border-stone-100 pt-4">
          <div className="mb-3">
            <p className="text-[15px] font-semibold leading-5 text-stone-900">Card layout</p>
            <p className="mt-1 text-[13px] leading-5 text-stone-500">
              {cardLayout === "grid"
                ? "Grid layout — two cards per row"
                : cardLayout === "single"
                  ? "Single layout — one card per row"
                  : "Compact layout — shorter cards for faster browsing"}
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
                  onClick={() => setCardLayout(option.value)}
                  className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 ${
                    isSelected
                      ? "border-ink-700 bg-ink-50 text-ink-900"
                      : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <span className="text-sm font-bold leading-5">{option.label}</span>
                  <span className="mt-0.5 text-[11px] leading-4">{option.detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 border-t border-stone-100 pt-4">
          <div>
            <p className="text-[15px] font-semibold leading-5 text-stone-900">
              {isDarkMode ? "Dark mode" : "Light mode"}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-stone-500">
              {isDarkMode ? "A darker appearance for low light" : "A lighter appearance for daytime"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDarkMode}
            aria-label={isDarkMode ? "Dark mode" : "Light mode"}
            onClick={() => setTheme(isDarkMode ? "light" : "dark")}
            className={`settings-display-switch relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 ${
              isDarkMode ? "bg-ink-600" : "bg-stone-300"
            }`}
          >
            <span
              aria-hidden="true"
              className={`theme-switch-thumb h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isDarkMode ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="settings-notifications-title">
        <div className="mb-4">
          <h2 id="settings-notifications-title" className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">
            Notifications
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Get a quiet update when something on your list returns on special or gets a meaningfully better price.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-5 text-stone-900">Push notifications</p>
            <p className="mt-1 text-[13px] leading-5 text-stone-500">{pushNotificationDescription}</p>
          </div>
          {canManagePushNotifications && pushPermissionState === "granted" && (
            <button
              type="button"
              role="switch"
              aria-checked={pushEnabled}
              aria-label="Push notifications"
              disabled={authLoading || isSavingNotifications}
              onClick={() => void handlePushToggle()}
              className={`settings-display-switch relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                pushEnabled ? "bg-ink-600" : "bg-stone-300"
              }`}
            >
              <span
                aria-hidden="true"
                className={`theme-switch-thumb h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${pushEnabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          )}
        </div>
        {canManagePushNotifications && pushPermissionState !== "granted" && (
          <button
            type="button"
            disabled={authLoading || isSavingNotifications}
            onClick={() => void (notificationPermissionDenied ? handleOpenNotificationSettings() : handleEnableNotifications())}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-stone-200 px-4 py-3 text-left text-[14px] font-semibold text-ink-700 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{notificationPermissionDenied ? "Open iPhone Settings" : "Enable notifications"}</span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
          </button>
        )}
        {notificationError && <p role="status" className="mt-3 text-[13px] leading-5 text-alert-700">{notificationError}</p>}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Legal</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Learn how Dodgy Deal handles your information.
          </p>
        </div>
        <Link
          href="/privacy"
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800"
        >
          <span>
            <span className="block">Privacy policy</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Collection, use, storage, and your privacy rights
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <Link
          href="/terms"
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800"
        >
          <span>
            <span className="block">Terms of use</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Rules for using Dodgy Deal
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Help</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Get help or let us know when something needs fixing.
          </p>
        </div>
        <Link
          href="/support"
          onClick={captureSettingsScrollPosition}
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800"
        >
          <span>
            <span className="block">Contact support</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Get help with the app
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <Link
          href="/report-deal"
          onClick={captureSettingsScrollPosition}
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800"
        >
          <span>
            <span className="block">Report an incorrect deal</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Help us keep prices and specials accurate
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800">
          <span>
            <span className="block">App version</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Dodgy Deal mobile app
            </span>
          </span>
          <span className="text-[13px] font-semibold tabular-nums text-stone-500">0.1.0</span>
        </div>
      </section>

      {!authLoading && user && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Account</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">Manage your account details and sign-in.</p>
          </div>
          <div className="flex flex-col gap-4 border-t border-stone-100 pt-4">
            <div>
              <p className="dd-type-meta dd-type-meta-strong text-stone-500">Email</p>
              <p className="mt-0.5 dd-type-secondary dd-type-secondary-strong text-stone-900">{accountEmail}</p>
            </div>
            {user.created_at && (
              <div>
                <p className="dd-type-meta dd-type-meta-strong text-stone-500">Member since</p>
                <p className="mt-0.5 dd-type-secondary dd-type-secondary-strong text-stone-900">
                  {new Date(user.created_at).toLocaleDateString("en-NZ", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsLogoutSheetOpen(true)}
              className="dd-btn dd-btn-outline-alert mt-1 w-full cursor-pointer"
            >
              Log out
            </button>
          </div>
        </section>
      )}

      {!authLoading && user && (
        <section className="rounded-2xl border border-alert-100 bg-white p-5 shadow-sm" aria-labelledby="settings-danger-zone-title">
          <div className="mb-4">
            <h2 id="settings-danger-zone-title" className="font-display text-[17px] font-extrabold tracking-normal text-alert-700">
              Danger zone
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Permanently remove your account and personal data.
            </p>
          </div>
          <div className="border-t border-alert-100 pt-4">
            <p className="text-[13px] leading-5 text-stone-600">
              This permanently deletes your profile, saved lists, and browsing history. You can&apos;t undo this.
            </p>
            <button
              type="button"
              onClick={() => {
                setAccountDeleteError(null);
                setAccountDeleted(false);
                setIsDeleteSheetOpen(true);
              }}
              className="dd-btn dd-btn-outline-alert mt-4 w-full cursor-pointer"
            >
              Delete account
            </button>
          </div>
        </section>
      )}

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
                      onClick={() => setIsDeleteSheetOpen(false)}
                      aria-label="Close"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
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
                    onClick={() => setIsLogoutSheetOpen(false)}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
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

      <BottomSheetPortal open={isNameSheetOpen}>
        <AnimatePresence>
          {isNameSheetOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close edit name sheet"
                className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
                onClick={() => setIsNameSheetOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-edit-name-sheet-title"
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                  <h2 id="settings-edit-name-sheet-title" className="dd-type-sheet-title text-stone-900">Edit your name</h2>
                  <button
                    type="button"
                    onClick={() => setIsNameSheetOpen(false)}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSaveName();
                  }}
                  className="flex flex-1 flex-col gap-3 px-5 py-4 pb-safe-sm"
                >
                  <label className="flex flex-col gap-1.5">
                    <span className="dd-type-meta dd-type-meta-strong text-stone-500">Name</span>
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      placeholder="Enter your name"
                      autoComplete="name"
                      autoFocus
                      disabled={isSavingName}
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-stone-700 placeholder:text-stone-500 focus:border-stone-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                    />
                  </label>
                  {nameError && <p className="dd-type-secondary text-alert-600">{nameError}</p>}
                  <button
                    type="submit"
                    disabled={isSavingName || !nameDraft.trim()}
                    className="dd-btn dd-btn-primary mt-auto w-full cursor-pointer"
                  >
                    {isSavingName ? "Saving…" : "Save"}
                  </button>
                </form>
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>
    </motion.main>
  );
}
