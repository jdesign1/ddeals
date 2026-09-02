"use client";

import { useEffect, useState } from "react";
import WinkMascot from "@/components/WinkMascot";

const SPLASH_DURATION_MS = 4_800;
const SPLASH_EXIT_MS = 260;

/** One-time branded startup layer shown after the native launch storyboard.
 *
 * The root layout keeps this component mounted across App Router navigation,
 * so its local state naturally prevents the intro from replaying on route
 * changes. Do not use a module-level guard here: this client component is
 * also rendered by the remote Next.js server, where module state would be
 * shared across separate app requests and suppress the splash for later
 * launches.
 */
export default function LaunchSplash() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setMinimumElapsed(true), reducedMotion ? 300 : SPLASH_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!minimumElapsed) return;

    const exitTimer = window.setTimeout(() => setExiting(true), 0);
    const removeTimer = window.setTimeout(() => setVisible(false), SPLASH_EXIT_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, [minimumElapsed]);

  if (!visible) return null;

  return (
    <div
      className={`launch-splash${exiting ? " launch-splash--exit" : ""}`}
      aria-hidden="true"
    >
      <WinkMascot className="wink-mascot--startup" />
    </div>
  );
}
