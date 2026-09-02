"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * Shared loading-state indicator (2026-08-09, per Jay's ask): the mascot
 * mark (the same logo used in AppHeader/Home's tagline row) turns to face
 * left/right in a loop while loading, then fades out once loading finishes
 * rather than the indicator just vanishing.
 *
 * Callers render this unconditionally and toggle the `loading` prop --
 * NOT wrapped in `{loading && <LoadingMascot .../>}`. Wrapping it in a
 * conditional would unmount it the instant `loading` flips to false,
 * skipping the fade-out entirely; this component manages its own mount
 * state internally so the fade actually gets to play before it's removed
 * from the DOM.
 */
export default function LoadingMascot({
  loading,
}: {
  loading: boolean;
}) {
  // Stays mounted for one extra tick after `loading` goes false so the
  // opacity transition below has something to animate -- an immediate
  // unmount would skip straight past the fade.
  const [mounted, setMounted] = useState(loading);

  // Render-time state adjustment (not an effect) for the "loading just
  // started" transition -- a synchronous mirror of the `loading` prop, same
  // pattern AppHeader uses for its own prop-driven state (see its
  // lastPathname comment). react-hooks/set-state-in-effect flags this exact
  // update if it's done inside a useEffect body instead.
  const [lastLoading, setLastLoading] = useState(loading);
  if (loading !== lastLoading) {
    setLastLoading(loading);
    if (loading) setMounted(true);
  }

  // The delayed unmount below is a genuine effect (subscribing to a timer),
  // not a synchronous derivation, so it stays in useEffect.
  useEffect(() => {
    if (loading) return;
    const timeout = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timeout);
  }, [loading]);

  if (!mounted) return null;

  return (
    <div
      className={`flex flex-col items-center gap-3 px-5 py-10 transition-opacity duration-300 ease-out ${
        loading ? "opacity-100" : "opacity-0"
      }`}
    >
      <Image
        src="/logo.svg"
        alt=""
        width={48}
        height={48}
        className="theme-logo h-12 w-12 flex-shrink-0 animate-mascot-turn"
      />
    </div>
  );
}
