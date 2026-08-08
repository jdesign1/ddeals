"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Minimal email/password sign-in/sign-up form, shared by /lists (S1's auth
 * gate) and the add-to-list picker on /specials. Not a Stitch-designed
 * screen (the 12-screen inventory has no login mock) — plain functional UI,
 * not a design port, same as the Home tab placeholder.
 */
export default function AuthPanel({ prompt }: { prompt?: string }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      } else {
        const { error, needsEmailConfirmation } = await signUp(email, password);
        if (error) setError(error);
        else if (needsEmailConfirmation) setConfirmationSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmationSent) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm font-semibold text-stone-900">Check your email</p>
        <p className="text-sm text-stone-600">
          We sent a confirmation link to <span className="font-medium">{email}</span>. Confirm it,
          then sign in below.
        </p>
        <button
          onClick={() => {
            setConfirmationSent(false);
            setMode("signin");
          }}
          className="mt-1 w-fit text-xs font-semibold underline"
          style={{ color: "var(--color-brand-primary)" }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      {prompt && <p className="text-sm text-stone-600">{prompt}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        {error && (
          <p className="text-xs" style={{ color: "var(--color-brand-error)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-brand-primary)" }}
        >
          {submitting ? "Please wait…" : mode === "signin" ? "Log In" : "Create Account"}
        </button>
      </form>
      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
        className="text-xs font-semibold text-stone-500 underline"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Log in"}
      </button>
    </div>
  );
}
