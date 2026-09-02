"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useCardLayout } from "@/lib/card-layout-context";
import { usePageHeader } from "@/lib/header-context";
import { useAuth } from "@/lib/auth-context";
import BottomSheetPortal from "@/components/BottomSheetPortal";

export default function SettingsPage() {
  const router = useRouter();
  const { isGridLayout, setCardLayout } = useCardLayout();
  const { user, loading: authLoading, signOut } = useAuth();
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isLogoutSheetOpen, setIsLogoutSheetOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const backNavigationStartedRef = useRef(false);

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

  return (
    <motion.main
      initial={{ x: "100%" }}
      animate={{ x: isNavigatingBack ? "100%" : 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-full w-full flex flex-col gap-4 px-5 py-5 pb-10"
    >
      {!authLoading && user && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Account</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">Manage your account details and sign-in.</p>
          </div>
          <div className="flex flex-col gap-4 border-t border-stone-100 pt-4">
            <div>
              <p className="dd-type-meta dd-type-meta-strong text-stone-500">Email</p>
              <p className="mt-0.5 dd-type-secondary dd-type-secondary-strong text-stone-900">{user.email}</p>
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

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h1 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Layout</h1>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Choose how deal cards are displayed across Check Deals and search.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4">
          <div>
            <p className="text-[15px] font-semibold leading-5 text-stone-900">Grid layout</p>
            <p className="mt-1 text-[13px] leading-5 text-stone-500">
              {isGridLayout ? "Grid layout — two cards per row" : "Single layout — one card per row"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isGridLayout}
            aria-label="Grid layout"
            onClick={() => setCardLayout(isGridLayout ? "single" : "grid")}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 ${
              isGridLayout ? "bg-ink-600" : "bg-stone-300"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isGridLayout ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
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

      <BottomSheetPortal open={isLogoutSheetOpen}>
        <AnimatePresence>
          {isLogoutSheetOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close log out confirmation"
                className="dd-bottom-sheet-backdrop fixed inset-0 z-50 bg-black/40"
                onClick={() => setIsLogoutSheetOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-logout-sheet-title"
                className="dd-bottom-sheet fixed inset-x-0 bottom-0 z-[51] mx-auto w-full max-w-[480px] rounded-t-3xl bg-white px-5 pb-8 pt-6 shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              >
                <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-stone-200" />
                <h2 id="settings-logout-sheet-title" className="dd-type-sheet-title text-stone-900">Log out?</h2>
                <p className="mt-2 dd-type-body text-stone-600">Are you sure you want to log out of Dodgy Deals?</p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsLogoutSheetOpen(false)}
                    disabled={isLoggingOut}
                    className="dd-btn dd-btn-outline w-full cursor-pointer"
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
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>
    </motion.main>
  );
}
