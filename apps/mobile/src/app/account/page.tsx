"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import LoadingMascot from "@/components/LoadingMascot";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import { useAuth } from "@/lib/auth-context";
import { usePageHeader } from "@/lib/header-context";

/**
 * "Manage Account" -- ported (in spirit, not verbatim) from
 * Prototype/index.html's `ManageAccountTab`, per Jay's ask to add the
 * prototype's profile menu items to the app (see `AppHeader.tsx`'s own
 * doc comment for the full decision). Reached from the profile menu,
 * signed-in users only -- same `!user` gate `/me` and `/lists` already
 * use, now opening the global `AuthSheet` (`openAuthSheet`, 2026-08-19)
 * instead of rendering `AuthPanel` as the whole page -- see
 * lists/page.tsx's own version of this comment for the full reasoning.
 *
 * Deliberately a SIMPLE placeholder, not a full port (Jay's own call when
 * asked how to handle this): the prototype's `ManageAccountTab` is a large
 * fake account-editing surface -- editable name/age/zip fields, a
 * password-change form, a fake free/paid plan toggle with a full credit-
 * card payment form, "cancel account" -- all backed by `localStorage`, not
 * any real user-profile schema this app has. Porting that verbatim would
 * mean building a card-payment UI with nothing real behind it and profile
 * fields (age group, zip) this app's real Supabase `auth.users` row has no
 * equivalent for -- exactly the kind of fabricated functionality this
 * app's own conventions elsewhere avoid (see `AddToListButton.tsx`/
 * `deal-checks.ts`'s own header comments on the same point). This page
 * instead shows only what's real: the signed-in user's actual email and
 * account-created date (straight off the real Supabase `user` object) and
 * a working Log Out button (same `signOut()` call `AppHeader.tsx`'s menu
 * already uses) -- with a plain note that more account settings are
 * coming later, rather than a form that saves nowhere.
 */
export default function AccountPage() {
  const router = useRouter();
  const { user, loading, signOut, openAuthSheet } = useAuth();
  const [isLogoutSheetOpen, setIsLogoutSheetOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  usePageHeader("Manage Account", () => router.back());

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

  if (loading) {
    return (
      <main className="flex flex-col gap-3 px-5 py-6">
        <LoadingMascot loading />
      </main>
    );
  }

  if (!user) {
    const prompt = "Log in to manage your account.";
    return (
      <main className="flex flex-col gap-4 px-5 py-6">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-center">
          <p className="max-w-xs px-4 text-sm font-bold text-stone-700">{prompt}</p>
          <button
            type="button"
            onClick={() => openAuthSheet(prompt)}
            className="dd-btn dd-btn-primary cursor-pointer"
          >
            Log in or create an account
          </button>
        </div>
      </main>
    );
  }

  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-NZ", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <>
      <main className="flex flex-col gap-4 px-5 py-6 pb-10">
      <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
        <div>
          <p className="dd-type-meta dd-type-meta-strong text-stone-500">Email</p>
          <p className="mt-0.5 dd-type-secondary dd-type-secondary-strong text-stone-900">{user.email}</p>
        </div>
        {joined && (
          <div>
            <p className="dd-type-meta dd-type-meta-strong text-stone-500">Member since</p>
            <p className="mt-0.5 dd-type-secondary dd-type-secondary-strong text-stone-900">{joined}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4">
        <p className="text-[13px] leading-relaxed text-stone-500">
          More account settings (changing your password, deleting your account) are coming soon.
        </p>
      </div>

      {/* Brand Guide v1.0 "06 — UI KIT / BUTTONS" outline pill shape
          (2026-08-13 UI tidy-up), alert-colored variant -- see
          `.dd-btn-outline-alert` in globals.css. */}
      <button
        type="button"
        onClick={() => setIsLogoutSheetOpen(true)}
        className="dd-btn dd-btn-outline-alert w-full cursor-pointer"
      >
        Log Out
      </button>
      </main>

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
              aria-labelledby="logout-sheet-title"
              className="dd-bottom-sheet fixed inset-x-0 bottom-0 z-[51] mx-auto w-full max-w-[480px] rounded-t-3xl bg-white px-5 pb-8 pt-6 shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-stone-200" />
              <h2 id="logout-sheet-title" className="dd-type-sheet-title text-stone-900">
                Log out?
              </h2>
              <p className="mt-2 dd-type-body text-stone-600">
                Are you sure you want to log out of Dodgy Deals?
              </p>
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
    </>
  );
}
