"use client";

import Image from "next/image";

/**
 * Shared "data failed to load" state (2026-08-11, per Jay's ask after
 * hitting a real `dodgy_deals` 500 on the local dev build — see project.md's
 * same-day session for the root-cause investigation).
 *
 * There's no dedicated error-state mock anywhere in this project: grepped
 * `Prototype/index.html` and `docs/` for anything error-related and found
 * only a single `console.warn` catch, no UI. So rather than inventing a new
 * visual language, this reuses the two patterns this app already has for
 * "nothing to show here, here's why + what to do" states — the dashed-card
 * treatment `page.tsx`'s signed-out `MyListSection` and `lists/page.tsx`'s
 * "No lists yet" empty state both use, plus the mascot mark `LoadingMascot`
 * uses for "the app is doing something" — so a failed load reads as a calm
 * continuation of the same design system, not a jarring red-text stack
 * trace. Every bare `<p style={{ color: "var(--color-brand-error)" }}>
 * {error}</p>` this app had (Home's Trending rail + My List tab,
 * /specials, /lists) is being replaced with this, all getting a real Try
 * Again action for the first time — none of those call sites let you retry
 * without a full page reload before this.
 *
 * `detail` (the raw `Error#message`) is shown in a smaller, muted line
 * under the friendly headline rather than swallowed — this app's whole
 * premise is not hiding real information from Jay, and a specific message
 * (e.g. "dodgy_deals -> HTTP 500") is genuinely useful when reporting a bug,
 * it's just not the first, biggest thing on screen anymore.
 */
export default function ErrorState({
  message = "Couldn't load this right now.",
  detail,
  onRetry,
}: {
  message?: string;
  detail?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-alert-200 bg-white py-10 text-center">
      <Image
        src="/logo.svg"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 flex-shrink-0 opacity-60 grayscale"
        aria-hidden="true"
      />
      <div className="max-w-xs px-4">
        <p className="text-sm font-bold text-alert-700">{message}</p>
        {detail && <p className="mt-1 text-xs text-stone-500">{detail}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-ink-600"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
