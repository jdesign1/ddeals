"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, type AccountIdentity } from "@/lib/auth-context";

function hasProvider(identities: AccountIdentity[], provider: string): boolean {
  return identities.some((identity) => identity.provider === provider);
}

function describeAppleIdentityError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("already linked") ||
    normalized.includes("already associated") ||
    normalized.includes("identity already exists") ||
    normalized.includes("another user")
  ) {
    return "This Apple account is already linked to another Dodgy Deal account. For now, sign in with Apple to use that account; account merging isn't available yet.";
  }
  if (normalized.includes("manual linking") || normalized.includes("linking is not enabled")) {
    return "Apple linking is not enabled yet. Please try again later.";
  }
  return "We couldn't link Apple right now. Please try again.";
}

export default function IdentityLinkingPanel() {
  const {
    user,
    getLinkedIdentities,
    linkAppleIdentity,
  } = useAuth();
  const [identities, setIdentities] = useState<AccountIdentity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
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
      setError(describeAppleIdentityError(result.error));
    } else {
      await loadIdentities();
      setMessage("Apple sign-in is linked to this account. Your Watchlist will stay the same whichever method you use.");
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
          Only linked methods can access this account. Email linking is currently unavailable.
        </p>
      </div>

      {isLoading ? (
        <div role="status" className="h-16 animate-pulse rounded-xl bg-stone-100" aria-label="Loading sign-in methods" />
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
        </div>
      )}

      {message && <p role="status" className="mt-3 text-[13px] leading-5 text-fair-700">{message}</p>}
      {error && <p role="alert" className="mt-3 text-[13px] leading-5 text-alert-700">{error}</p>}
    </section>
  );
}
