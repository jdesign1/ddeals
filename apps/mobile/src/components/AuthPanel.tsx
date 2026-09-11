"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useAuth, type AccountDetails } from "@/lib/auth-context";

type AuthMode = "signin" | "signup";
type AuthView = "details" | "otp" | "profile";

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getDateBounds() {
  const toIso = (date: Date) => date.toISOString().slice(0, 10);
  const now = new Date();
  return {
    min: toIso(new Date(now.getFullYear() - 120, now.getMonth(), now.getDate())),
    max: toIso(new Date(now.getFullYear() - 13, now.getMonth(), now.getDate())),
  };
}

function validateEmail(email: string): string | null {
  return EMAIL_FORMAT_RE.test(email.trim()) ? null : "Enter a valid email address.";
}

function validateDetails(mode: AuthMode, details: AccountDetails, email: string): string | null {
  if (mode === "signup") {
    if (!details.full_name.trim()) return "Enter your name.";
    if (!details.date_of_birth) return "Select your date of birth.";
    if (!/^\d{4}$/.test(details.zip_code)) return "Enter a valid NZ postcode.";
  }
  return validateEmail(email);
}

function validateProfile(details: AccountDetails): string | null {
  if (!details.full_name.trim()) return "Enter your name.";
  if (!details.date_of_birth) return "Select your date of birth.";
  if (!/^\d{4}$/.test(details.zip_code)) return "Enter a valid NZ postcode.";
  return null;
}

export default function AuthPanel({
  onSuccess,
  onOpenLegal,
  mode,
}: {
  prompt?: string;
  onSuccess: () => void;
  onOpenLegal: (path: "/privacy" | "/terms") => void;
  mode: AuthMode;
}) {
  const {
    user,
    profile,
    profileLoading,
    profileError,
    requestOtp,
    verifyOtp,
    signInWithProvider,
    completeProfile,
  } = useAuth();
  const [view, setView] = useState<AuthView>("details");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [details, setDetails] = useState<AccountDetails>({ full_name: "", date_of_birth: "", zip_code: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [lastMode, setLastMode] = useState(mode);
  const otpRef = useRef<HTMLInputElement>(null);
  const dateBounds = useMemo(() => getDateBounds(), []);

  if (mode !== lastMode) {
    setLastMode(mode);
    setView("details");
    setOtp("");
    setError(null);
    setResendCooldown(0);
    if (mode === "signin") setDetails({ full_name: "", date_of_birth: "", zip_code: "" });
  }

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const profileIncomplete = !!user && !profileLoading && !profile?.onboarding_complete;
  const showProfile = view === "profile" || profileIncomplete;

  async function handleRequestOtp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const validationError = validateDetails(mode, details, email);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestOtp(email, mode === "signup");
      if (result.error) {
        setError("We couldn't send a code. Check your email and try again.");
        return;
      }
      setView("otp");
      setOtp("");
      setResendCooldown(80);
      window.setTimeout(() => otpRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await verifyOtp(email, otp);
      if (result.error) {
        setError("That code is invalid or has expired. Request a new code and try again.");
        return;
      }
      if (mode === "signup") {
        setView("profile");
      } else if (result.profile?.onboarding_complete) {
        onSuccess();
      } else {
        setView("profile");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestOtp(email, mode === "signup");
      if (result.error) setError("We couldn't resend the code. Please try again.");
      else setResendCooldown(80);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProvider(provider: "google" | "apple") {
    setError(null);
    setSubmitting(true);
    try {
      const result = await signInWithProvider(provider);
      if (result.error) setError("We couldn't start that sign-in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteProfile(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const validationError = validateProfile(details);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const result = await completeProfile(details);
      if (result.error) setError("We couldn't save your account details. Please try again.");
      else if (result.profile?.onboarding_complete) onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "dd-auth-field w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-stone-700 shadow-sm transition-colors placeholder:text-stone-500 focus:border-stone-900 focus:outline-none";
  const labelClass = "block dd-type-meta dd-type-meta-strong text-stone-500";
  const errorClass = "dd-type-meta dd-type-meta-strong text-alert-600";
  const canRequestOtp = validateDetails(mode, details, email) === null;

  if (profileLoading) {
    return <p className="py-8 text-center dd-type-secondary text-stone-500">Checking your account…</p>;
  }

  if (showProfile) {
    return (
      <form onSubmit={handleCompleteProfile} className="flex flex-col gap-4" noValidate>
        <div>
          <p className="dd-type-section text-stone-900">Complete your account</p>
          <p className="mt-1 dd-type-secondary text-stone-600">
            Add your details so we can personalise Dodgy Deal and understand how people use it.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Name</span>
          <input
            type="text"
            placeholder="John Doe"
            value={details.full_name}
            onChange={(event) => setDetails((current) => ({ ...current, full_name: event.target.value }))}
            className={inputClass}
            autoComplete="name"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Date of birth</span>
          <span className="relative min-w-0 overflow-hidden">
            <input
              type="date"
              min={dateBounds.min}
              max={dateBounds.max}
              value={details.date_of_birth}
              onChange={(event) => setDetails((current) => ({ ...current, date_of_birth: event.target.value }))}
              className={`${inputClass} auth-date-input min-w-0 appearance-none pr-11 ${!details.date_of_birth ? "auth-date-empty" : ""}`}
              placeholder="dd/mm/yy"
            />
            {!details.date_of_birth && (
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-stone-500">
                dd/mm/yy
              </span>
            )}
            <CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>NZ zip code</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 6011"
            value={details.zip_code}
            onChange={(event) => setDetails((current) => ({ ...current, zip_code: event.target.value.replace(/\D/g, "") }))}
            className={inputClass}
            autoComplete="postal-code"
          />
        </label>

        {(error || profileError) && <p className="dd-type-secondary text-alert-600">{error || profileError}</p>}
        <button type="submit" disabled={submitting} className="dd-btn dd-btn-primary w-full cursor-pointer">
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    );
  }

  if (view === "otp") {
    return (
      <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4" noValidate>
        <div>
          <p className="dd-type-section text-stone-900">Enter your verification code</p>
          <p className="mt-1 dd-type-secondary text-stone-600">
            We sent a 6-digit code to <span className="font-semibold text-stone-800">{email}</span>.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={error ? errorClass : labelClass}>{error || "Verification code"}</span>
          <input
            ref={otpRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="123456"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
            className={`${inputClass} text-center tracking-[0.35em]`}
            autoFocus
          />
        </label>
        <button type="submit" disabled={submitting} className="dd-btn dd-btn-primary w-full cursor-pointer">
          {submitting ? "Checking…" : "Verify code"}
        </button>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => { setView("details"); setError(null); }} className="cursor-pointer dd-type-control text-stone-600 hover:text-stone-900">
            Change email
          </button>
          <button type="button" disabled={resendCooldown > 0 || submitting} onClick={() => void handleResend()} className="cursor-pointer dd-type-control text-ink-600 disabled:cursor-default disabled:text-stone-400">
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="dd-type-secondary text-stone-600">
        {mode === "signup" ? "Create an account to save lists and spot more dodgy deals." : "Login to Dodgy deals with your email and a one-time code."}
      </p>
      <form onSubmit={handleRequestOtp} className="flex flex-col gap-4" noValidate>
        {mode === "signup" && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Name</span>
              <input type="text" placeholder="John Doe" value={details.full_name} onChange={(event) => setDetails((current) => ({ ...current, full_name: event.target.value }))} className={inputClass} autoComplete="name" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Date of birth</span>
              <span className="relative min-w-0 overflow-hidden">
                <input type="date" min={dateBounds.min} max={dateBounds.max} value={details.date_of_birth} onChange={(event) => setDetails((current) => ({ ...current, date_of_birth: event.target.value }))} className={`${inputClass} auth-date-input min-w-0 appearance-none pr-11 ${!details.date_of_birth ? "auth-date-empty" : ""}`} placeholder="dd/mm/yy" />
                {!details.date_of_birth && (
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-stone-500">dd/mm/yy</span>
                )}
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500" aria-hidden="true" />
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>NZ zip code</span>
              <input type="text" inputMode="numeric" maxLength={4} placeholder="e.g. 6011" value={details.zip_code} onChange={(event) => setDetails((current) => ({ ...current, zip_code: event.target.value.replace(/\D/g, "") }))} className={inputClass} autoComplete="postal-code" />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={validateEmail(email) && email ? errorClass : labelClass}>{validateEmail(email) && email ? "Enter a valid email address." : "Email address"}</span>
          <input type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} autoComplete="email" />
        </label>
        {mode === "signup" && (
          <p className="text-[12px] leading-relaxed text-stone-500">
            By creating an account, you acknowledge our{" "}
            <Link href="/privacy" onClick={(event) => { event.preventDefault(); onOpenLegal("/privacy"); }} className="font-bold text-ink-600 underline underline-offset-2">Privacy policy</Link>
            {" "}and agree to our{" "}
            <Link href="/terms" onClick={(event) => { event.preventDefault(); onOpenLegal("/terms"); }} className="font-bold text-ink-600 underline underline-offset-2">Terms of use</Link>.
          </p>
        )}
        {error && <p className="dd-type-secondary text-alert-600">{error}</p>}
        <button type="submit" disabled={submitting || !canRequestOtp} className="dd-btn dd-btn-primary w-full cursor-pointer">
          {submitting ? "Please wait…" : "Send log in code"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-stone-400" aria-hidden="true"><span className="h-px flex-1 bg-stone-200" /><span className="dd-type-meta">or</span><span className="h-px flex-1 bg-stone-200" /></div>
      <div className="flex flex-col gap-3">
        <button type="button" disabled={submitting} onClick={() => void handleProvider("google")} className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-stone-400 bg-white px-5 py-3 text-base font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50">
          <GoogleMark />
          Sign in with Google
        </button>
        <button type="button" disabled={submitting} onClick={() => void handleProvider("apple")} className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-black px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50">
          <AppleMark />
          Sign in with Apple
        </button>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M21.35 12.27c0-.78-.07-1.54-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.15c1.84-1.69 2.9-4.18 2.9-7.42Z" />
      <path fill="#34A853" d="M12 21.72c2.63 0 4.84-.87 6.45-2.35l-3.15-2.45c-.87.58-1.98.92-3.3.92-2.54 0-4.69-1.72-5.46-4.03H3.29v2.52A9.74 9.74 0 0 0 12 21.72Z" />
      <path fill="#FBBC05" d="M6.54 13.81A5.85 5.85 0 0 1 6.23 12c0-.63.11-1.24.31-1.81V7.67H3.29A9.74 9.74 0 0 0 2.26 12c0 1.57.38 3.06 1.03 4.33l3.25-2.52Z" />
      <path fill="#EA4335" d="M12 6.16c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.27 14.63 2.28 12 2.28a9.74 9.74 0 0 0-8.71 5.39l3.25 2.52c.77-2.31 2.92-4.03 5.46-4.03Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 fill-current" aria-hidden="true">
      <path d="M17.05 12.54c-.02-2.06 1.68-3.05 1.76-3.1a3.77 3.77 0 0 0-2.97-1.61c-1.25-.13-2.46.74-3.1.74-.65 0-1.64-.72-2.7-.7a3.98 3.98 0 0 0-3.34 2.04c-1.44 2.5-.37 6.2 1.01 8.23.68.99 1.48 2.09 2.54 2.05 1.02-.04 1.4-.66 2.64-.66 1.23 0 1.58.66 2.65.64 1.1-.02 1.8-1 2.46-2 .77-1.12 1.09-2.21 1.11-2.26a3.5 3.5 0 0 1-2.06-3.37ZM15 6.52a3.53 3.53 0 0 0 .81-2.54 3.6 3.6 0 0 0-2.33 1.2 3.37 3.37 0 0 0-.83 2.45A2.98 2.98 0 0 0 15 6.52Z" />
    </svg>
  );
}
