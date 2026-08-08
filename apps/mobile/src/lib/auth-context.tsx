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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getSupabaseClient();
    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

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
        const client = getSupabaseClient();
        await client.auth.signOut();
      },
    }),
    [user, session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
