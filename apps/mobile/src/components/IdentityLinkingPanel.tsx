"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, type AccountIdentity } from "@/lib/auth-context";

type EmailLinkStep = "idle" | "verify";

function hasProvider(identities: AccountIdentity[], provider: string): boolean {
  return identities.some((identity) => identity.provider === provider);
}

function describeIdentityError(message: string, method: "apple" | "email"): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("already linked") ||
    normalized.includes("already associated") ||
    normalized.includes("identity already exists") ||
    normalized.includes("another user")
  ) {
    return method === "apple"
      ? "This Apple account is already linked to another Dodgy Deal account. We need to merge those accounts before linking it."
      : "That email is already linked to another Dodgy Deal account. Sign in to that account and add Apple from Settings."
  }
  if (normalized.includes("manual linking") || normalized.includes("linking is not enabled")) {
    return "Account linking is not enabled yet. Please try again later."
  }
  if (normalized.includes("email") && (normalized.includes("already") || normalized.includes("taken") || normalized.includes("exists"))) {
    return "That email is already in use by another Dodgy Deal account."
  }
  return method === "apple"
    ? "We couldn't link Apple right now. Please try again."
    : "We couldn't link that email right now. Please try again.";
}

export default function IdentityLinkingPanel() {
  const {
    user,
    getLinkedIdentities,
    linkAppleIdentity,
    requestEmailIdentityLink,
    verifyEmailIdentityLink,
  } = useAuth();
  const [identities, setIdentities] = useState<AccountIdentity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [currentOtp, setCurrentOtp] = useState("");
  const [newOtp, setNewOtp] = useState("");
  const [emailLinkStep, setEmailLinkStep] = useState<EmailLinkStep>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIdentities = useCallback(async () => {
    if (!user) {
      setIdentities([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await getLinkedIdentities();
      setIdentities(result.identities);
      if (result.error) setError("We couldn't load your sign-in methods.");
      else setError(null);
    } catch {
      setError("We couldn't load your sign-in methods.");
    } finally {
      setIsLoading(false);
    }
  }, [getLinkedIdentities, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadIdentities(), 0);
    return () => window.clearTimeout(timer);
  }, [loadIdentities]);

  const hasEmailIdentity = hasProvider(identities, "email");
  const hasAppleIdentity = hasProvider(identities, "apple");

  async function handleLinkApple() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    const result = await linkAppleIdentity();
    if (result.error) {
      setError(describeIdentityError(result.error, "apple"));
    } else {
      await loadIdentities();
      setMessage("Apple sign-in is linked to this account. Your Watchlist will stay the same whichever method you use.");
    }
    setIsBusy(false);
  }

  async function handleRequestEmailLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setIsBusy(true);
    setError(null);
    setMessage(null);
    const result = await requestEmailIdentityLink(normalizedEmail);
    if (result.error) {
      setError(describeIdentityError(result.error, "email"));
    } else {
      setEmail(result.newEmail || normalizedEmail);
      setCurrentEmail(result.currentEmail);
      setCurrentOtp("");
      setNewOtp("");
      setEmailLinkStep("verify");
      setMessage(
        result.currentEmail
          ? "We sent codes to your current and new email addresses. The current-email code is optional if you already confirmed that email."
          : "We sent a verification code to that email. Enter it below to finish linking.",
      );
    }
    setIsBusy(false);
  }

  async function handleVerifyEmailLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    setMessage(null);
    const result = await verifyEmailIdentityLink({
      currentEmail,
      currentToken: currentOtp,
      newEmail: email,
      newToken: newOtp,
    });
    if (result.error) {
      setError(result.error.startsWith("Enter the verification code")
        ? result.error
        : describeIdentityError(result.error, "email"));
    } else {
      setEmailLinkStep("idle");
      setCurrentEmail(null);
      setCurrentOtp("");
      setNewOtp("");
      await loadIdentities();
      setMessage("Email sign-in is linked to this account. Your Watchlist will stay the same whichever method you use.");
    }
    setIsBusy(false);
  }

  return (
    <section className="mt-5 border-t border-stone-100 pt-4" aria-labelledby="settings-sign-in-methods-title">
      <div className="mb-3">
        <h3 id="settings-sign-in-methods-title" className="text-[15px] font-semibold leading-5 text-stone-900">
          Sign-in methods
        </h3>
        <p className="mt-1 text-[13px] leading-5 text-stone-500">
          Link Apple and email sign-in to this same account so your Watchlist stays in one place.
        </p>
      </div>

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-stone-100" aria-label="Loading sign-in methods" />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-stone-900">Email sign-in</p>
              <p className="text-[12px] text-stone-500">{hasEmailIdentity ? "Linked to this account" : "Not linked"}</p>
            </div>
            {hasEmailIdentity && <span className="text-[12px] font-bold text-fair-700">Linked</span>}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-stone-900">Apple</p>
              <p className="text-[12px] text-stone-500">{hasAppleIdentity ? "Linked to this account" : "Not linked"}</p>
            </div>
            {hasAppleIdentity ? (
              <span className="text-[12px] font-bold text-fair-700">Linked</span>
            ) : (
              <button
                type="button"
                onClick={() => void handleLinkApple()}
                disabled={isBusy}
                className="shrink-0 rounded-full bg-stone-900 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? "Linking…" : "Link Apple"}
              </button>
            )}
          </div>

          {!hasEmailIdentity && emailLinkStep === "idle" && (
            <form onSubmit={(event) => void handleRequestEmailLink(event)} className="mt-2 flex flex-col gap-2">
              <label className="text-[12px] font-bold text-stone-600" htmlFor="identity-link-email">Email address</label>
              <div className="flex gap-2">
                <input
                  id="identity-link-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isBusy}
                  className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[14px] text-stone-700 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none disabled:bg-stone-50"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="shrink-0 rounded-xl border border-stone-900 px-3 py-2.5 text-[12px] font-bold text-stone-900 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send code
                </button>
              </div>
            </form>
          )}

          {!hasEmailIdentity && emailLinkStep === "verify" && (
            <form onSubmit={(event) => void handleVerifyEmailLink(event)} className="mt-2 flex flex-col gap-2">
              {currentEmail && (
                <>
                  <label className="text-[12px] font-bold text-stone-600" htmlFor="identity-link-current-code">
                    Current email code <span className="font-normal text-stone-400">(optional if already confirmed)</span>
                  </label>
                  <input
                    id="identity-link-current-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={currentOtp}
                    onChange={(event) => setCurrentOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="Code from your current email"
                    disabled={isBusy}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[14px] tracking-[0.2em] text-stone-700 placeholder:tracking-normal placeholder:text-stone-400 focus:border-stone-900 focus:outline-none disabled:bg-stone-50"
                  />
                </>
              )}
              <label className="text-[12px] font-bold text-stone-600" htmlFor="identity-link-new-code">New email code</label>
              <div className="flex gap-2">
                <input
                  id="identity-link-new-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={newOtp}
                  onChange={(event) => setNewOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="123456"
                  disabled={isBusy}
                  className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[14px] tracking-[0.2em] text-stone-700 placeholder:tracking-normal placeholder:text-stone-400 focus:border-stone-900 focus:outline-none disabled:bg-stone-50"
                />
                <button
                  type="submit"
                  disabled={isBusy || newOtp.length < 6}
                  className="shrink-0 rounded-xl border border-stone-900 px-3 py-2.5 text-[12px] font-bold text-stone-900 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Verify
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmailLinkStep("idle");
                  setCurrentEmail(null);
                  setCurrentOtp("");
                  setNewOtp("");
                  setError(null);
                }}
                className="self-start text-[12px] font-semibold text-stone-500 underline underline-offset-2"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      )}

      {message && <p role="status" className="mt-3 text-[13px] leading-5 text-fair-700">{message}</p>}
      {error && <p role="alert" className="mt-3 text-[13px] leading-5 text-alert-700">{error}</p>}
    </section>
  );
}
