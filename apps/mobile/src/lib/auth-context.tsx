"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@dodgey-deals/shared";
import { getAccountsSupabaseClient } from "./accounts-supabase-client";
import { authRedirectUrl } from "./accounts-config";
import { isNativeAppleSignInAvailable, linkWithNativeApple, signInWithNativeApple } from "./native-apple-auth";
import { isNativeGoogleSignInAvailable, signInWithNativeGoogle } from "./native-google-auth";

export interface AccountProfile {
  id: string;
  full_name: string;
  date_of_birth: string;
  zip_code: string | null;
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

export type AccountIdentity = {
  id: string;
  identity_id: string;
  provider: string;
  email?: string;
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: AccountProfile | null;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  authConfigured: boolean;
  isAuthSheetOpen: boolean;
  /** True after the auth sheet has been opened once this session. */
  hasOpenedAuthSheet: boolean;
  authSheetPrompt: string | undefined;
  onboardingTourRequest: "new" | "replay" | null;
  openAuthSheet: (prompt?: string) => void;
  closeAuthSheet: () => void;
  requestOnboardingTour: () => void;
  dismissOnboardingTour: () => void;
  requestOtp: (email: string, shouldCreateUser: boolean) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null; profile: AccountProfile | null }>;
  signInWithProvider: (provider: AuthProviderName) => Promise<{ error: string | null }>;
  getLinkedIdentities: () => Promise<{ error: string | null; identities: AccountIdentity[] }>;
  linkAppleIdentity: () => Promise<{ error: string | null }>;
  requestEmailIdentityLink: (email: string) => Promise<{
    error: string | null;
    currentEmail: string | null;
    newEmail: string;
  }>;
  verifyEmailIdentityLink: (params: {
    currentEmail: string | null;
    currentToken?: string;
    newEmail: string;
    newToken: string;
  }) => Promise<{ error: string | null }>;
  completeProfile: (details: AccountDetails) => Promise<{ error: string | null; profile: AccountProfile | null }>;
  updateProfileName: (name: string) => Promise<{ error: string | null; profile: AccountProfile | null }>;
  refreshProfile: () => Promise<AccountProfile | null>;
  signOut: () => Promise<void>;
  isAnonymousSession: boolean;
  signInAsDevUser: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PROVIDER_RETURN_STORAGE_KEY = "dd-provider-auth-return";

async function readProfile(
  client: NonNullable<ReturnType<typeof getAccountsSupabaseClient>>,
  userId: string
): Promise<AccountProfile | null> {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccountProfile | null) ?? null;
}

function isJwtTimingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /jwt|token/i.test(message) && /future|issued|expired|clock|time/i.test(message);
}

function profileLoadErrorMessage(error: unknown): string {
  if (isJwtTimingError(error)) return "We couldn't verify your account. Please try again.";
  return "We couldn't load your account details. Please try again.";
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
  const [isAuthSheetOpen, setIsAuthSheetOpen] = useState(false);
  const [hasOpenedAuthSheet, setHasOpenedAuthSheet] = useState(false);
  const [authSheetPrompt, setAuthSheetPrompt] = useState<string | undefined>(undefined);
  const [onboardingTourRequest, setOnboardingTourRequest] = useState<"new" | "replay" | null>(null);
  const pendingProviderProfileRef = useRef(false);
  const profileRecoveryInFlightRef = useRef(false);

  useEffect(() => {
    if (!client) {
      return;
    }

    let cancelled = false;

    const syncProfile = async (
      nextUser: User | null,
      resumeProviderFlow = false,
      allowJwtRecovery = true
    ) => {
      if (!nextUser) {
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
        setOnboardingTourRequest(null);
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
          else {
            setHasOpenedAuthSheet(true);
            setIsAuthSheetOpen(true);
          }
        }
      } catch (error) {
        if (cancelled) return;

        // A stale/native token can be rejected by PostgREST with a JWT timing
        // error. Refresh it once before deciding that the profile is missing.
        // The auth listener also receives TOKEN_REFRESHED, so the ref prevents
        // that event from starting a second recovery loop while this retry is
        // in flight.
        if (allowJwtRecovery && !profileRecoveryInFlightRef.current && isJwtTimingError(error)) {
          profileRecoveryInFlightRef.current = true;
          try {
            const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
            if (!refreshError && refreshed.session) {
              await syncProfile(refreshed.user ?? nextUser, resumeProviderFlow, false);
              return;
            }
          } finally {
            profileRecoveryInFlightRef.current = false;
          }
        }

        setProfile(null);
        if (process.env.NODE_ENV !== "production") {
          console.warn("[auth] Profile lookup failed", {
            userId: nextUser.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        setProfileError(profileLoadErrorMessage(error));
        if (resumeProviderFlow) {
          setHasOpenedAuthSheet(true);
          setIsAuthSheetOpen(true);
        }
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
      void syncProfile(data.session?.user ?? null, providerReturn);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      const resumeProviderFlow = pendingProviderProfileRef.current;
      pendingProviderProfileRef.current = false;
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
      isAuthSheetOpen,
      hasOpenedAuthSheet,
      authSheetPrompt,
      onboardingTourRequest,
      openAuthSheet: (prompt) => {
        setHasOpenedAuthSheet(true);
        setAuthSheetPrompt(prompt);
        setIsAuthSheetOpen(true);
      },
      closeAuthSheet: () => setIsAuthSheetOpen(false),
      requestOnboardingTour: () => setOnboardingTourRequest("replay"),
      dismissOnboardingTour: () => setOnboardingTourRequest(null),
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
        setProfileError(null);
        const { data, error } = await client.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          type: "email",
        });
        if (error || !data.user) {
          return { error: error?.message ?? "That code could not be verified.", profile: null };
        }
        try {
          const nextProfile = await readProfile(client, data.user.id);
          setProfile(nextProfile);
          return { error: null, profile: nextProfile };
        } catch (profileReadError) {
          setProfile(null);
          setProfileError(profileLoadErrorMessage(profileReadError));
          return { error: null, profile: null };
        }
      },
      signInWithProvider: async (provider) => {
        if (!client) return { error: configurationError() };

        if (provider === "apple" && isNativeAppleSignInAvailable()) {
          pendingProviderProfileRef.current = true;
          try {
            const authResult = await signInWithNativeApple(client);
            if (authResult.error) pendingProviderProfileRef.current = false;
            return { error: authResult.error?.message ?? null };
          } catch (error) {
            pendingProviderProfileRef.current = false;
            return { error: error instanceof Error ? error.message : "Apple sign-in failed." };
          }
        }

        if (provider === "google" && isNativeGoogleSignInAvailable()) {
          pendingProviderProfileRef.current = true;
          try {
            const authResult = await signInWithNativeGoogle(client);
            if (authResult.error) pendingProviderProfileRef.current = false;
            return { error: authResult.error?.message ?? null };
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
      getLinkedIdentities: async () => {
        if (!client) return { error: configurationError(), identities: [] };
        if (!user) return { error: "Please sign in before managing sign-in methods.", identities: [] };
        const { data, error } = await client.auth.getUserIdentities();
        return {
          error: error?.message ?? null,
          identities: (data?.identities ?? []) as AccountIdentity[],
        };
      },
      linkAppleIdentity: async () => {
        if (!client) return { error: configurationError() };
        if (!user) return { error: "Please sign in before linking Apple." };

        if (isNativeAppleSignInAvailable()) {
          try {
            const authResult = await linkWithNativeApple(client);
            if (!authResult.error) {
              const { data: refreshedUser } = await client.auth.getUser();
              if (refreshedUser.user) setUser(refreshedUser.user);
            }
            return { error: authResult.error?.message ?? null };
          } catch (error) {
            return { error: error instanceof Error ? error.message : "Apple linking failed." };
          }
        }

        const { error } = await client.auth.linkIdentity({
          provider: "apple",
          options: { redirectTo: authRedirectUrl },
        });
        return { error: error?.message ?? null };
      },
      requestEmailIdentityLink: async (email) => {
        if (!client) return { error: configurationError(), currentEmail: null, newEmail: "" };
        if (!user) {
          return {
            error: "Please sign in before adding an email sign-in method.",
            currentEmail: null,
            newEmail: "",
          };
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) return { error: "Enter an email address.", currentEmail: null, newEmail: "" };
        if (normalizedEmail === user.email?.trim().toLowerCase()) {
          return {
            error: "That email is already the email on this account.",
            currentEmail: user.email ?? null,
            newEmail: normalizedEmail,
          };
        }
        const { error } = await client.auth.updateUser(
          { email: normalizedEmail },
          { emailRedirectTo: authRedirectUrl || undefined },
        );
        return {
          error: error?.message ?? null,
          currentEmail: user.email ?? null,
          newEmail: normalizedEmail,
        };
      },
      verifyEmailIdentityLink: async ({ currentEmail, currentToken, newEmail, newToken }) => {
        if (!client) return { error: configurationError() };
        if (!user) return { error: "Please sign in before verifying an email sign-in method." };
        const normalizedCurrentEmail = currentEmail?.trim().toLowerCase() || "";
        const normalizedCurrentToken = currentToken?.trim() || "";
        const normalizedNewEmail = newEmail.trim().toLowerCase();
        const normalizedNewToken = newToken.trim();
        if (!normalizedNewEmail || !/^\d{6,8}$/.test(normalizedNewToken)) {
          return { error: "Enter the verification code from your new email." };
        }
        if (normalizedCurrentToken && !/^\d{6,8}$/.test(normalizedCurrentToken)) {
          return { error: "Enter the verification code from your current email." };
        }
        if (normalizedCurrentToken && normalizedCurrentEmail) {
          const { error } = await client.auth.verifyOtp({
            email: normalizedCurrentEmail,
            token: normalizedCurrentToken,
            type: "email_change",
          });
          if (error) return { error: error.message };
        }
        const { error } = await client.auth.verifyOtp({
          email: normalizedNewEmail,
          token: normalizedNewToken,
          type: "email_change",
        });
        if (!error) {
          const { data: refreshedUser } = await client.auth.getUser();
          if (refreshedUser.user) setUser(refreshedUser.user);
        }
        return { error: error?.message ?? null };
      },
      completeProfile: async (details) => {
        if (!client) return { error: configurationError(), profile: null };
        // OTP verification updates Supabase's session before React receives the
        // auth-state event. Read the current user as a fallback so the signup
        // details can be saved immediately after verification instead of
        // forcing the user through the same form a second time.
        if (!user) {
          const { data, error } = await client.auth.getUser();
          if (error || !data.user) {
            return {
              error: error?.message ?? "Please verify your sign-in before completing your account.",
              profile: null,
            };
          }
        }
        const { data, error } = await client.rpc("complete_onboarding", {
          p_full_name: details.full_name.trim(),
          p_date_of_birth: details.date_of_birth,
          p_zip_code: details.zip_code.trim() || null,
        });
        if (error) return { error: error.message, profile: null };
        const nextProfile = data as AccountProfile;
        setProfile(nextProfile);
        setOnboardingTourRequest("new");
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
        setProfileLoading(true);
        setProfileError(null);
        try {
          const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
          if (refreshError) throw new Error(refreshError.message);
          const nextProfile = await readProfile(client, refreshed.user?.id ?? user.id);
          setProfile(nextProfile);
          return nextProfile;
        } catch (error) {
          setProfile(null);
          setProfileError(profileLoadErrorMessage(error));
          return null;
        } finally {
          setProfileLoading(false);
        }
      },
      signOut: async () => {
        if (!client) return;
        // Push tokens are unique to this installed app. Remove this account's
        // server registration before clearing its auth session, so a signed-out
        // device does not keep receiving list updates for the previous user.
        try {
          await client.rpc("unregister_push_devices");
        } catch {
          // A transient API failure must never strand the user signed in.
        }
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
    [
      client,
      user,
      session,
      profile,
      loading,
      profileLoading,
      profileError,
      isAuthSheetOpen,
      hasOpenedAuthSheet,
      authSheetPrompt,
      onboardingTourRequest,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
