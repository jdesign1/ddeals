"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@dodgey-deals/shared";
import { getSupabaseClient } from "./supabase-client";

/**
 * Real Supabase Auth (email/password), wired 2026-08-08 alongside S1 "My
 * Lists" — see project.md. Email confirmation is ON at the project level
 * (`mailer_autoconfirm: false`, confirmed via /auth/v1/settings) and no
 * SMTP/email-sending setup has been done yet (Jay's call this session:
 * build the real auth wiring now, connect up actual email delivery later
 * as separate infra work) — so `signUp` below surfaces GoTrue's real
 * "check your email to confirm" response rather than assuming an
 * immediate session, and doesn't fake a signed-in state.
 *
 * `isAnonymousSession`/`signInAsDevUser` (2026-08-09, reworked 2026-08-13)
 * are the dev-only "test account" shortcut for testing logged-in UI without
 * a real email/password -- see that block's own doc comment below for
 * exactly what it does.
 *
 * `signUp`'s optional `metadata` param (2026-08-14, per Jay: "copy the
 * create account flow from the prototype" / "copy all the UI, we can wire
 * it later to supabase") -- the prototype's sign-up form collects Name,
 * Age Group, and ZIP code alongside email/password, but this app's own
 * schema has no columns for any of the three (confirmed via `list_tables`
 * pre-existing this session, unchanged here). Rather than silently
 * dropping that real user input on the floor -- which is what "wire it
 * later" would mean if this stayed a two-arg call -- `signUp` now accepts
 * an optional metadata object and forwards it as `options: { data:
 * metadata }`, so Supabase stores it in `auth.users.raw_user_meta_data`
 * (and the live session's `user_metadata`) for free, same mechanism
 * `signInAsDevUser` below already uses for `full_name`. It is NOT read
 * back anywhere yet (no profile screen surfaces Age Group/ZIP) -- that's
 * the actual "wire it later" work still outstanding, e.g. a real `users`/
 * `profiles` table + RLS if this data needs to be queried, not just
 * stored. Flagging this explicitly per this codebase's "no fabrication,
 * no silent discarding" convention rather than leaving it ambiguous.
 *
 * `isAuthSheetOpen`/`authSheetPrompt`/`openAuthSheet`/`closeAuthSheet`
 * (2026-08-19, per Jay: "The login/sign up screen needs it's own dedicated
 * bottom sheet, and not live on the Lists page") -- `AuthPanel` used to be
 * the ENTIRE page content on /lists, /me, /history, and /account whenever
 * `!user` (a full-page swap, not a real gate), so a signed-out visit to any
 * of those routes showed nothing else at all. Lives here rather than in
 * search-context.tsx (which owns `isScannerOpen`/`openScanner` the same
 * way) because this state is fundamentally about auth, not search --
 * `AuthSheet.tsx` (mounted once globally in GlobalOverlays.tsx, same
 * pattern as `ScannerModal`) reads it straight from `useAuth()`, and each
 * of those 4 pages now renders its own real empty state (same dashed-card
 * pattern `page.tsx`'s signed-out `MyListSection` already used) with a "Log
 * in" button that calls `openAuthSheet(prompt)` instead of replacing the
 * whole page. `authSheetPrompt` carries each page's own existing prompt
 * copy through unchanged (e.g. "Log in to review every supermarket deal
 * and price you've checked.") so the sheet's copy still varies by what
 * gated it, exactly like before.
 */

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Whether the global auth bottom sheet (`AuthSheet.tsx`) is open. */
  isAuthSheetOpen: boolean;
  /** The prompt text shown inside the sheet -- whichever page's `openAuthSheet` call last set it. */
  authSheetPrompt: string | undefined;
  /** Opens the auth sheet with an optional page-specific prompt (e.g. "Log in to manage your account."). */
  openAuthSheet: (prompt?: string) => void;
  closeAuthSheet: () => void;
  /** Returns `needsEmailConfirmation: true` when Supabase issued no session (email confirmation required, not yet done).
   * `metadata`, when given, is passed straight through to Supabase as `options.data` and lands in
   * `auth.users.raw_user_meta_data` / the session's `user_metadata` -- see this file's top-of-file
   * doc comment for why AuthPanel now sends Name/Age Group/ZIP through here (2026-08-14). */
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, string>
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** True when `user` is a real Supabase anonymous-auth account
   * (`user.is_anonymous`), not a permanent email/password account -- lets
   * callers (AppHeader's test-mode banner, AuthPanel's own button) show/hide
   * accordingly. Unlike the old `isFakeSession` this replaced (2026-08-13),
   * an anonymous session IS a real Supabase account with a real JWT: every
   * read/write goes through RLS exactly like a normal signed-in user and
   * genuinely persists. This flag is purely informational now (e.g. "no
   * email tied to this session, can't sign back into it from another
   * device"), not a "does this even work" gate. */
  isAnonymousSession: boolean;
  /** Dev-only: signs in as a real (but anonymous, unnamed) Supabase account
   * for quick manual testing of logged-in flows -- see the block below for
   * exactly what this does and doesn't do, and why it can fail. */
  signInAsDevUser: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Dev-only "test account" button (2026-08-09, per Jay's ask: "create a fake
 * login we can use to test logged in state"). Originally a pure client-side
 * simulation -- Jay's own choice at the time over a real seeded account --
 * so it never touched the real Supabase client's session: no real JWT, so
 * every RLS-gated write (createList, logDealCheck, ...) had to be
 * short-circuited with an `isFakeSession` check across Lists/History/Me/the
 * deal-assessment page, and each of those screens showed an amber banner
 * warning "this won't actually save."
 *
 * Swapped to a real Supabase anonymous sign-in (2026-08-13, per Jay: "make
 * test account real ... so it can actually create/delete lists like a
 * normal signed-in user," after reporting My List "can't create any lists,
 * even when logged in with the test account" -- that was the old fake
 * login's RLS short-circuit working exactly as designed, not a bug, but
 * Jay's ask here is to remove the limitation rather than just explain it).
 * `client.auth.signInAnonymously()` creates (or resumes) a genuine
 * `auth.users` row with `is_anonymous: true`, a real session, and a real
 * JWT -- every RLS policy this app has (`lists`, `list_items`,
 * `deal_checks`, all keyed on plain `auth.uid() = user_id`, confirmed via
 * `execute_sql`, no anonymous-blocking clause anywhere) now passes for it
 * exactly like a real signed-in user. That's what let every
 * `isFakeSession`-gated write across the app (Lists' create/delete, the
 * deal-assessment page's `logDealCheck`) come out entirely, and let the
 * "won't actually save" banners on Lists/History/Me/AppHeader either
 * soften to something accurate or drop -- see each of those files' own doc
 * comments for the specific change.
 *
 * Requires "Enable anonymous sign-ins" turned ON for this Supabase project
 * (Authentication -> Sign In / Providers -> Anonymous in the dashboard) --
 * confirmed via `/auth/v1/settings` that this was OFF as of 2026-08-13
 * (`"anonymous_users": false`), and there's no tool/API available in this
 * session to flip that project-level setting from here (it's an Auth
 * service config, not a database migration), so it's a manual step on
 * Jay's end before this button actually works end-to-end. Until then,
 * `signInAnonymously()` fails with a real GoTrue error -- confirmed live
 * via a direct `/auth/v1/signup` POST: `422 anonymous_provider_disabled,
 * "Anonymous sign-ins are disabled"` -- surfaced through this function's
 * returned `error` string (AuthPanel shows it) rather than silently doing
 * nothing or crashing.
 *
 * Passes `options: { data: { full_name: "Test Shopper" } }` so the account
 * still greets as "Test Shopper" in the header/menu (`AppHeader.tsx`'s
 * `greetingName` reads `user_metadata.full_name` first) instead of falling
 * back to "there" -- anonymous users have no `email` for that fallback to
 * use.
 *
 * Still gated on `process.env.NODE_ENV` (inlined by Next.js at build time)
 * so this is a real no-op in a production build, not just hidden --
 * unchanged from the original fake-login's own reasoning, since the point
 * (a quick manual-testing shortcut, not a real product "guest mode") is the
 * same either way. `AuthPanel.tsx`'s call site is ALSO gated on the same
 * check, so this is never reachable at all in production, not merely
 * disabled.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthSheetOpen, setIsAuthSheetOpen] = useState(false);
  const [authSheetPrompt, setAuthSheetPrompt] = useState<string | undefined>(undefined);

  useEffect(() => {
    const client = getSupabaseClient();
    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Anonymous sign-ins (like real ones) go through this same listener --
    // `signInAnonymously()` calls the real client's `_saveSession` +
    // notifies subscribers with a real 'SIGNED_IN' event, so no separate
    // bypass/ref trick is needed here any more (the old fake login, which
    // never touched this client at all, needed one to stop this listener's
    // async `getSession()`/token-refresh callbacks from stomping the fake
    // state back to null -- removed 2026-08-13 along with the fake login
    // itself, see this file's top-of-file doc comment).
    const { data: subscription } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      isAuthSheetOpen,
      authSheetPrompt,
      openAuthSheet: (prompt) => {
        setAuthSheetPrompt(prompt);
        setIsAuthSheetOpen(true);
      },
      closeAuthSheet: () => setIsAuthSheetOpen(false),
      signUp: async (email, password, metadata) => {
        const client = getSupabaseClient();
        const { data, error } = await client.auth.signUp({
          email,
          password,
          ...(metadata ? { options: { data: metadata } } : {}),
        });
        if (error) return { error: error.message, needsEmailConfirmation: false };
        // Supabase returns a user with no session when email confirmation is required
        // (mailer_autoconfirm: false on this project) -- distinguish that from a real
        // sign-in rather than treating "no error" as "logged in".
        return { error: null, needsEmailConfirmation: data.session === null };
      },
      signIn: async (email, password) => {
        const client = getSupabaseClient();
        const { error } = await client.auth.signInWithPassword({ email, password });
        return { error: error ? error.message : null };
      },
      signOut: async () => {
        // Anonymous sessions are real Supabase sessions now (2026-08-13),
        // so the same real `signOut()` call correctly ends either kind --
        // no more separate "fake session, just reset local state" branch
        // (the old fake login never had a real session to sign out of in
        // the first place, which is why that branch existed).
        const client = getSupabaseClient();
        await client.auth.signOut();
      },
      isAnonymousSession: !!user?.is_anonymous,
      signInAsDevUser: async () => {
        if (process.env.NODE_ENV === "production") {
          // Belt-and-braces: the call site is also gated on the same check
          // (see AuthPanel.tsx), so this should be unreachable in a
          // production build regardless -- but a plain no-op here (rather
          // than assuming the caller-side gate is enough) means this
          // function can never do anything even if something did call it.
          console.warn("signInAsDevUser is disabled in production builds.");
          return { error: null };
        }
        const client = getSupabaseClient();
        const { error } = await client.auth.signInAnonymously({
          options: { data: { full_name: "Test Shopper" } },
        });
        return { error: error ? error.message : null };
      },
    }),
    [user, session, loading, isAuthSheetOpen, authSheetPrompt]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
