"use client";

import MascotImage from "@/components/MascotImage";

/**
 * Shared "data failed to load" state (2026-08-11, per Jay's ask after
 * hitting a real `dodgy_deals` 500 on the local dev build — see project.md's
 * same-day session for the root-cause investigation).
 *
 * A failed load uses the same solid, neutral card styling as the app's
 * empty states, with the empty-basket mascot to make the interruption feel
 * clear and calm. Every bare `<p style={{ color: "var(--color-brand-error)" }}>
 * {error}</p>` this app had (Home's Trending rail + My List tab,
 * /specials, /lists) is being replaced with this, all getting a real Try
 * Again action for the first time — none of those call sites let you retry
 * without a full page reload before this.
 *
 * `detail` is the short, user-friendly explanation from
 * `describeFetchError`, shown below the headline.
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
    <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl border border-stone-200/80 bg-white px-4 py-10 text-center">
      <MascotImage
        src="/empty-results-mascot.webp"
        darkSrc="/empty-results-mascot-dark.webp"
        alt="Dodgy Deal mascot looking into an empty shopping basket"
        width={256}
        height={202}
        sizes="128px"
        unoptimized
        className="mascot-wave h-auto w-full max-w-[8rem]"
      />
      <div className="max-w-xs px-4">
        <p className="dd-type-secondary dd-type-secondary-strong text-alert-700">{message}</p>
        {detail && <p className="mt-1 dd-type-meta text-stone-500">{detail}</p>}
      </div>
      {/* Brand Guide v1.0 "06 — UI KIT / BUTTONS" primary pill
          (2026-08-13 UI tidy-up). */}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="dd-btn dd-btn-primary cursor-pointer"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
