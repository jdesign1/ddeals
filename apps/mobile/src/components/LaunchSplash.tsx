"use client";

import { useEffect, useState } from "react";
import WinkMascot from "@/components/WinkMascot";

const SPLASH_DURATION_MS = 4_800;
const SPLASH_EXIT_MS = 260;
let hasPlayedLaunchSplash = false;

/** One-time branded startup layer shown after the native launch storyboard.
 *
 * The root layout normally keeps this component mounted across App Router
 * navigation. The module-level guard is an extra safety net for native
 * WebView/layout remounts: route changes must never replay the app-intro
 * animation, while a fresh WebView/app launch gets one new intro.
 */
export default function LaunchSplash() {
  const [shouldPlay] = useState(() => {
    if (hasPlayedLaunchSplash) return false;
    hasPlayedLaunchSplash = true;
    return true;
  });
  const [visible, setVisible] = useState(shouldPlay);
  const [exiting, setExiting] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  useEffect(() => {
    if (!shouldPlay) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setMinimumElapsed(true), reducedMotion ? 300 : SPLASH_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [shouldPlay]);

  useEffect(() => {
    if (!shouldPlay) return;
    if (!minimumElapsed) return;

    const exitTimer = window.setTimeout(() => setExiting(true), 0);
    const removeTimer = window.setTimeout(() => setVisible(false), SPLASH_EXIT_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, [minimumElapsed, shouldPlay]);

  if (!shouldPlay || !visible) return null;

  return (
    <div
      className={`launch-splash${exiting ? " launch-splash--exit" : ""}`}
      aria-hidden="true"
    >
      <WinkMascot className="wink-mascot--startup" />
    </div>
  );
}
