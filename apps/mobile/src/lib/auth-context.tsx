"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
 * `isFakeSession`/`signInAsDevUser` (2026-08-09) are the one deliberate
 * exception to "doesn't fake a signed-in state" above -- a dev-only local
 * simulation for testing logged-in UI, see that block's own doc comment
 * for exactly what it does and doesn't do.
 */

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Returns `needsEmailConfirmation: true` when Supabase issued no session (email confirmation required, not yet done). */
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** True while `user`/`session` are the local dev-only fake login below,
   * not a real Supabase session -- lets callers (AppHeader's test-mode
   * banner, AuthPanel's own button) show/hide accordingly. */
  isFakeSession: boolean;
  /** Dev-only: simulates a signed-in user purely on the client, without
   * calling Supabase at all -- see the fake-login block below for why this
   * exists and exactly what it does and doesn't unlock. */
  signInAsDevUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Dev-only fake login (2026-08-09, per Jay's ask: "create a fake login we
 * can use to test logged in state"). Jay explicitly chose the "dev-only
 * client toggle" option over a real seeded Supabase account -- so this is
 * a pure client-side simulation, not a real account:
 *  - `getSupabaseClient()`'s actual session is never touched (no
 *    `client.auth.setSession(...)` call) -- there is no real JWT, so any
 *    RLS-gated request (fetchUserLists, createList, addItemToList, ...)
 *    still runs unauthenticated and will fail/return empty exactly like a
 *    signed-out user's would. This unlocks the *UI* gated on `!!user`
 *    (header greeting/avatar, "Log out" instead of a login form, Home's My
 *    List tab, Lists' create-list form) for layout/design testing, not the
 *    real backend flows behind it.
 *  - Guarded on `process.env.NODE_ENV` (inlined by Next.js at build time
 *    in both server and client bundles) so the function is a real no-op in
 *    a production build/`next start` — not just hidden-but-callable. Every
 *    call site (AuthPanel's button below) is ALSO gated on the same check,
 *    so this is never reachable at all in production, not merely disabled.
 *  - `AppHeader.tsx` shows a persistent amber "TEST MODE" strip whenever
 *    `isFakeSession` is true, specifically so this can never be mistaken
 *    for a real signed-in state mid-testing.
 */
const FAKE_USER_ID = "00000000-0000-4000-8000-000000000001";

function buildFakeUser(): User {
  const now = new Date().toISOString();
  return {
    id: FAKE_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "test-shopper@example.com",
    app_metadata: { provider: "dev-fake-login" },
    user_metadata: { full_name: "Test Shopper" },
    created_at: now,
    updated_at: now,
    email_confirmed_at: now,
    confirmed_at: now,
  } as User;
}

function buildFakeSession(user: User): Session {
  return {
    access_token: "dev-fake-access-token",
    refresh_token: "dev-fake-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  } as Session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFakeSession, setIsFakeSession] = useState(false);
  // Real Supabase auth events (getSession's initial resolve, token refresh,
  // etc.) arrive asynchronously and would otherwise stomp a fake session
  // back to null the moment any of them fire, since `onAuthStateChange`'s
  // callback is registered once (empty dep array) and would otherwise
  // close over a stale `isFakeSession` value. A ref, kept in sync below,
  // gives the listener a live read instead.
  const isFakeSessionRef = useRef(false);
  useEffect(() => {
    isFakeSessionRef.current = isFakeSession;
  }, [isFakeSession]);

  useEffect(() => {
    const client = getSupabaseClient();
    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled || isFakeSessionRef.current) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, newSession) => {
      if (isFakeSessionRef.current) return;
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
      signUp: async (email, password) => {
        const client = getSupabaseClient();
        const { data, error } = await client.auth.signUp({ email, password });
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
        // Fake sessions never touched the real Supabase client, so signing
        // out of one is just local state -- calling the real
        // `client.auth.signOut()` here would be a no-op at best (nothing to
        // sign out of) and is skipped entirely rather than relying on that.
        if (isFakeSessionRef.current) {
          setIsFakeSession(false);
          setUser(null);
          setSession(null);
          return;
        }
        const client = getSupabaseClient();
        await client.auth.signOut();
      },
      isFakeSession,
      signInAsDevUser: () => {
        if (process.env.NODE_ENV === "production") {
          // Belt-and-braces: every call site is also gated on the same
          // check (see AuthPanel.tsx), so this should be unreachable in a
          // production build regardless -- but a plain no-op here (rather
          // than assuming the caller-side gate is enough) means this
          // function can never do anything even if something did call it.
          console.warn("signInAsDevUser is disabled in production builds.");
          return;
        }
        const fakeUser = buildFakeUser();
        setUser(fakeUser);
        setSession(buildFakeSession(fakeUser));
        setIsFakeSession(true);
        setLoading(false);
      },
    }),
    [user, session, loading, isFakeSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
