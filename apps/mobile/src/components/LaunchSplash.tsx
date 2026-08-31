"use client";

import { useEffect, useState } from "react";
import WinkMascot from "@/components/WinkMascot";

const SPLASH_DURATION_MS = 4_800;
const SPLASH_EXIT_MS = 260;

/** One-time branded startup layer shown after the native launch storyboard. */
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
    if (!minimumElapsed || exiting) return;

    let removeTimer = 0;
    const exitTimer = window.setTimeout(() => {
      setExiting(true);
      removeTimer = window.setTimeout(() => setVisible(false), SPLASH_EXIT_MS);
    }, 0);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, [exiting, minimumElapsed]);

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
