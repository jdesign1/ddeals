"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@dodgey-deals/shared";
import { getAccountsSupabaseClient } from "./accounts-supabase-client";
import { authRedirectUrl } from "./accounts-config";
import { isNativeAppleSignInAvailable, signInWithNativeApple } from "./native-apple-auth";
import { isNativeGoogleSignInAvailable, signInWithNativeGoogle } from "./native-google-auth";

export interface AccountProfile {
  id: string;
  full_name: string;
  date_of_birth: string;
  zip_code: string;
  onboarding_complete: boolean;
  analytics_consent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountDetails {
  full_name: string;
  date_of_birth: string;
  zip_code: string;
}

type AuthProviderName = "google" | "apple";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: AccountProfile | null;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  authConfigured: boolean;
  loginNotice: { id: number; since: number | null } | null;
  isAuthSheetOpen: boolean;
  authSheetPrompt: string | undefined;
  openAuthSheet: (prompt?: string) => void;
  closeAuthSheet: () => void;
  requestOtp: (email: string, shouldCreateUser: boolean) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null; profile: AccountProfile | null }>;
  signInWithProvider: (provider: AuthProviderName) => Promise<{ error: string | null }>;
  completeProfile: (details: AccountDetails) => Promise<{ error: string | null; profile: AccountProfile | null }>;
  updateProfileName: (name: string) => Promise<{ error: string | null; profile: AccountProfile | null }>;
  refreshProfile: () => Promise<AccountProfile | null>;
  signOut: () => Promise<void>;
  isAnonymousSession: boolean;
  signInAsDevUser: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const LAST_LOGIN_STORAGE_KEY = "dd-last-login-at";
const PROVIDER_RETURN_STORAGE_KEY = "dd-provider-auth-return";
const NEW_SPECIALS_PENDING_HOME_LOGIN_SESSION_KEY = "dd-new-specials-pending-home-login";
const NEW_SPECIALS_PRESENTED_SESSION_KEY = "dd-new-specials-presented";
const NEW_SPECIALS_LEFT_HOME_SESSION_KEY = "dd-new-specials-left-home";

function readLastLoginAt(): number | null {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function writeLastLoginAt(): void {
  if (typeof window !== "undefined") window.localStorage.setItem(LAST_LOGIN_STORAGE_KEY, String(Date.now()));
}

function writePendingHomeLoginNotice(id: number): void {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(NEW_SPECIALS_PENDING_HOME_LOGIN_SESSION_KEY, String(id));
    } catch {
      // Session storage can be unavailable in restricted WebViews; the
      // in-memory login notice still drives the Home presentation when the
      // header remains mounted.
    }
  }
}

function clearNewSpecialsSessionMarkers(): void {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(NEW_SPECIALS_PRESENTED_SESSION_KEY);
      window.sessionStorage.removeItem(NEW_SPECIALS_LEFT_HOME_SESSION_KEY);
      window.sessionStorage.removeItem(NEW_SPECIALS_PENDING_HOME_LOGIN_SESSION_KEY);
    } catch {
      // Session storage can be unavailable in restricted WebViews.
    }
  }
}

async function readProfile(
  client: NonNullable<ReturnType<typeof getAccountsSupabaseClient>>,
  userId: string
): Promise<AccountProfile | null> {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccountProfile | null) ?? null;
}

function configurationError(): string {
  return "Account sign-in is not configured yet. Add the Accounts Supabase publishable key to .env.local.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getAccountsSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!client);
  const [loginNotice, setLoginNotice] = useState<{ id: number; since: number | null } | null>(null);
  const [isAuthSheetOpen, setIsAuthSheetOpen] = useState(false);
  const [authSheetPrompt, setAuthSheetPrompt] = useState<string | undefined>(undefined);
  const pendingLoginRef = useRef(false);
  const pendingLoginSinceRef = useRef<number | null>(null);
  const pendingProviderProfileRef = useRef(false);

  useEffect(() => {
    if (!client) {
      return;
    }

    let cancelled = false;

    const syncProfile = async (nextUser: User | null, resumeProviderFlow = false) => {
      if (!nextUser) {
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      setProfileError(null);
      try {
        const nextProfile = await readProfile(client, nextUser.id);
        if (cancelled) return;
        setProfile(nextProfile);
        if (resumeProviderFlow) {
          if (nextProfile?.onboarding_complete) setIsAuthSheetOpen(false);
          else setIsAuthSheetOpen(true);
        }
      } catch (error) {
        if (cancelled) return;
        setProfile(null);
        setProfileError(error instanceof Error ? error.message : "Unable to load account details.");
        if (resumeProviderFlow) setIsAuthSheetOpen(true);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const providerReturn = window.sessionStorage.getItem(PROVIDER_RETURN_STORAGE_KEY) === "1";
      if (providerReturn) window.sessionStorage.removeItem(PROVIDER_RETURN_STORAGE_KEY);
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user && !data.session.user.is_anonymous) {
        const since = readLastLoginAt();
        if (since === null) clearNewSpecialsSessionMarkers();
        const notice = { id: Date.now(), since };
        setLoginNotice(notice);
        writePendingHomeLoginNotice(notice.id);
        writeLastLoginAt();
      }
      void syncProfile(data.session?.user ?? null, providerReturn);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      const resumeProviderFlow = pendingProviderProfileRef.current;
      pendingProviderProfileRef.current = false;
      if (_event === "SIGNED_IN" && (pendingLoginRef.current || resumeProviderFlow)) {
        const since = pendingLoginSinceRef.current ?? readLastLoginAt();
        if (since === null) clearNewSpecialsSessionMarkers();
        const notice = { id: Date.now(), since };
        setLoginNotice(notice);
        writePendingHomeLoginNotice(notice.id);
        pendingLoginRef.current = false;
        pendingLoginSinceRef.current = null;
        writeLastLoginAt();
      }
      void syncProfile(nextSession?.user ?? null, resumeProviderFlow);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      profileLoading,
      profileError,
      authConfigured: !!client,
      loginNotice,
      isAuthSheetOpen,
      authSheetPrompt,
      openAuthSheet: (prompt) => {
        setAuthSheetPrompt(prompt);
        setIsAuthSheetOpen(true);
      },
      closeAuthSheet: () => setIsAuthSheetOpen(false),
      requestOtp: async (email, shouldCreateUser) => {
        if (!client) return { error: configurationError() };
        const { error } = await client.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { shouldCreateUser },
        });
        return { error: error?.message ?? null };
      },
      verifyOtp: async (email, token) => {
        if (!client) return { error: configurationError(), profile: null };
        pendingLoginSinceRef.current = readLastLoginAt();
        pendingLoginRef.current = true;
        const { data, error } = await client.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          type: "email",
        });
        if (error || !data.user) {
          pendingLoginRef.current = false;
          pendingLoginSinceRef.current = null;
          return { error: error?.message ?? "That code could not be verified.", profile: null };
        }
        try {
          const nextProfile = await readProfile(client, data.user.id);
          setProfile(nextProfile);
          return { error: null, profile: nextProfile };
        } catch (profileReadError) {
          setProfile(null);
          setProfileError(profileReadError instanceof Error ? profileReadError.message : "Unable to load account details.");
          return { error: null, profile: null };
        }
      },
      signInWithProvider: async (provider) => {
        if (!client) return { error: configurationError() };

        if (provider === "apple" && isNativeAppleSignInAvailable()) {
          pendingProviderProfileRef.current = true;
          try {
            const { error } = await signInWithNativeApple(client);
            if (error) pendingProviderProfileRef.current = false;
            return { error: error?.message ?? null };
          } catch (error) {
            pendingProviderProfileRef.current = false;
            return { error: error instanceof Error ? error.message : "Apple sign-in failed." };
          }
        }

        if (provider === "google" && isNativeGoogleSignInAvailable()) {
          pendingProviderProfileRef.current = true;
          try {
            const { error } = await signInWithNativeGoogle(client);
            if (error) pendingProviderProfileRef.current = false;
            return { error: error?.message ?? null };
          } catch (error) {
            pendingProviderProfileRef.current = false;
            return { error: error instanceof Error ? error.message : "Google sign-in failed." };
          }
        }

        if (typeof window !== "undefined") window.sessionStorage.setItem(PROVIDER_RETURN_STORAGE_KEY, "1");
        const { error } = await client.auth.signInWithOAuth({
          provider,
          options: { redirectTo: authRedirectUrl },
        });
        if (error && typeof window !== "undefined") window.sessionStorage.removeItem(PROVIDER_RETURN_STORAGE_KEY);
        return { error: error?.message ?? null };
      },
      completeProfile: async (details) => {
        if (!client) return { error: configurationError(), profile: null };
        if (!user) return { error: "Please verify your sign-in before completing your account.", profile: null };
        const { data, error } = await client.rpc("complete_onboarding", {
          p_full_name: details.full_name.trim(),
          p_date_of_birth: details.date_of_birth,
          p_zip_code: details.zip_code.trim(),
        });
        if (error) return { error: error.message, profile: null };
        const nextProfile = data as AccountProfile;
        setProfile(nextProfile);
        return { error: null, profile: nextProfile };
      },
      updateProfileName: async (name) => {
        if (!client) return { error: configurationError(), profile: null };
        if (!user) return { error: "Please sign in before updating your name.", profile: null };
        const trimmedName = name.trim();
        if (!trimmedName) return { error: "Enter your name.", profile: null };
        const { data, error } = await client
          .from("profiles")
          .update({ full_name: trimmedName })
          .eq("id", user.id)
          .select("*")
          .single();
        if (error) return { error: error.message, profile: null };
        const nextProfile = data as AccountProfile;
        setProfile(nextProfile);
        return { error: null, profile: nextProfile };
      },
      refreshProfile: async () => {
        if (!client || !user) return null;
        try {
          const nextProfile = await readProfile(client, user.id);
          setProfile(nextProfile);
          setProfileError(null);
          return nextProfile;
        } catch (error) {
          setProfileError(error instanceof Error ? error.message : "Unable to load account details.");
          return null;
        }
      },
      signOut: async () => {
        if (!client) return;
        await client.auth.signOut();
      },
      isAnonymousSession: !!user?.is_anonymous,
      signInAsDevUser: async () => {
        if (process.env.NODE_ENV === "production") return { error: null };
        if (!client) return { error: configurationError() };
        const { error } = await client.auth.signInAnonymously({
          options: { data: { full_name: "Test Shopper" } },
        });
        return { error: error?.message ?? null };
      },
    }),
    [client, user, session, profile, loading, profileLoading, profileError, loginNotice, isAuthSheetOpen, authSheetPrompt]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
