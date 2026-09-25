"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import WinkMascot from "@/components/WinkMascot";

// The native storyboard covers the first launch frame; give the WebView wink
// enough time to read clearly without holding the first screen for too long.
const SPLASH_DURATION_MS = 1200;
const SPLASH_EXIT_MS = 260;
type LaunchSplashStyle = CSSProperties & { "--launch-cycle-duration": string };
const SPLASH_CLAIM_KEY = "dd-launch-splash-claimed";
export const LAUNCH_SPLASH_COMPLETE_EVENT = "dd-launch-splash-complete";

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
  const pathname = usePathname();
  const launchPathnameRef = useRef<string | null>(pathname);
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.sessionStorage.getItem(SPLASH_CLAIM_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [exiting, setExiting] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const splashStyle: LaunchSplashStyle = {
    "--launch-cycle-duration": `${SPLASH_DURATION_MS}ms`,
  };

  useEffect(() => {
    if (!visible || pathname === null) return;
    if (launchPathnameRef.current === null) {
      launchPathnameRef.current = pathname;
      return;
    }
    if (pathname === launchPathnameRef.current) return;

    // A product can be opened while the first-launch wink is still playing.
    // Dismiss that startup-only layer as soon as the route changes so it
    // cannot cover the destination's normal PageLoader (or flash back over
    // the loaded deal page if sessionStorage is unavailable in a WebView).
    setVisible(false);
    setExiting(false);
    setMinimumElapsed(false);
  }, [pathname, visible]);

  useEffect(() => {
    if (!visible) return;
    // Claim the startup animation immediately. If a native/WebView route
    // transition remounts the root layout before the animation finishes, the
    // new route must not replay the long wink over the product-loading state.
    try {
      window.sessionStorage.setItem(SPLASH_CLAIM_KEY, "1");
    } catch {
      // Session storage can be unavailable in restricted WebViews; the
      // in-memory state still keeps the normal launch path working.
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setMinimumElapsed(true), reducedMotion ? 300 : SPLASH_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!minimumElapsed) return;

    const exitTimer = window.setTimeout(() => setExiting(true), 0);
    let completionFrame: number | null = null;
    const removeTimer = window.setTimeout(() => {
      setVisible(false);
      // Notify consumers after React has had a frame to remove the splash;
      // otherwise a listener that checks the DOM can still see the exiting
      // element and incorrectly remain in its launch-blocked state.
      completionFrame = window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event(LAUNCH_SPLASH_COMPLETE_EVENT));
      });
    }, SPLASH_EXIT_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
      if (completionFrame !== null) window.cancelAnimationFrame(completionFrame);
    };
  }, [minimumElapsed]);

  if (!visible) return null;

  return (
    <div
      className={`launch-splash${exiting ? " launch-splash--exit" : ""}`}
      aria-hidden="true"
      style={splashStyle}
    >
      <WinkMascot className="wink-mascot--startup" />
    </div>
  );
}
