"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Email/password sign-in/sign-up form, shared by /lists (S1's auth gate)
 * and the add-to-list picker on /specials. Not a Stitch-designed screen
 * (the 12-screen inventory has no login mock), so there was never a design
 * to port — but it went out the door as genuinely plain, unstyled markup
 * (`rounded-lg border-stone-300` inputs, a flat `var(--color-brand-primary)`
 * pill button), visibly out of step with the rest of the app's now-current
 * "Dodgy Deal · Mobile UI Kit" look (font-display, `ink-*` focus rings,
 * black `bg-stone-900`/`hover:bg-ink-600` CTA pills) that Home, AppHeader,
 * the deal-assessment page, and the full-screen search overlay all already
 * use. Restyled 2026-08-09 (Jay: "improve designs") to match that, since
 * this is one of the few real remaining screens that hadn't been brought
 * in line with it yet.
 *
 * Redirects to `/` (Home) on any successful login (real sign-in, real
 * sign-up when it returns an immediate session, and the dev-only fake
 * login) -- 2026-08-09, Jay: "take the user to the home screen after log
 * in." Sign-up that returns `needsEmailConfirmation: true` does NOT
 * redirect (there's no session yet to land on Home with); it stays on the
 * "check your email" panel as before.
 */
export default function AuthPanel({ prompt }: { prompt?: string }) {
  const { signIn, signUp, signInAsDevUser } = useAuth();
  const router = useRouter();
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
        else router.push("/");
      } else {
        const { error, needsEmailConfirmation } = await signUp(email, password);
        if (error) setError(error);
        else if (needsEmailConfirmation) setConfirmationSent(true);
        // No email-confirmation step configured on this project -- signUp
        // returned a real session immediately, same as signIn.
        else router.push("/");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmationSent) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-ink-50 p-5">
        <p className="font-display text-sm font-black tracking-tight text-stone-900">Check your email</p>
        <p className="text-sm text-stone-600">
          We sent a confirmation link to <span className="font-semibold text-stone-800">{email}</span>. Confirm it,
          then sign in below.
        </p>
        <button
          onClick={() => {
            setConfirmationSent(false);
            setMode("signin");
          }}
          className="mt-1 w-fit cursor-pointer text-xs font-black uppercase tracking-widest text-ink-600 transition-colors hover:text-ink-800 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5">
      {prompt && <p className="text-sm font-medium text-stone-600">{prompt}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-ink-200"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-ink-200"
        />
        {error && (
          <p className="text-xs font-medium" style={{ color: "var(--color-brand-error)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="cursor-pointer rounded-xl bg-stone-900 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Please wait…" : mode === "signin" ? "Log In" : "Create Account"}
        </button>
      </form>
      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
        className="w-fit cursor-pointer text-xs font-bold text-stone-500 transition-colors hover:text-stone-700 hover:underline"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Log in"}
      </button>

      {/* Dev-only fake login (2026-08-09, lib/auth-context.tsx) -- gated on
          NODE_ENV here too, not just inside signInAsDevUser itself, so this
          entire section (including the visual "dev tool" cue) simply
          doesn't exist in a production build rather than existing-but-inert.
          Deliberately styled to look like a dev tool, not a real product
          feature (dashed border, amber, monospace-ish uppercase warning
          copy) -- this should never be mistaken for a real "guest mode" or
          third option a real user might reasonably tap. */}
      {process.env.NODE_ENV === "development" && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Dev tool — not visible in production</p>
          <button
            type="button"
            onClick={() => {
              signInAsDevUser();
              router.push("/");
            }}
            className="cursor-pointer rounded-lg bg-amber-400 py-2 text-xs font-black uppercase tracking-widest text-amber-950 transition-colors hover:bg-amber-500"
          >
            Continue with test account
          </button>
          <p className="text-[10px] leading-relaxed text-amber-700">
            Simulates being logged in for UI testing only — no real account, and Lists won&rsquo;t save.
          </p>
        </div>
      )}
    </div>
  );
}
