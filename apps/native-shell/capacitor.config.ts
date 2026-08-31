import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for the Dodgy Deals iOS/Android apps.
 *
 * Load strategy: REMOTE URL (decided 2026-08-07, see project.md). The
 * `server.url` below points the WebView at the deployed apps/mobile Next.js
 * app instead of a bundled static export, so SSR/API routes/server actions
 * keep working and content/logic ships instantly without an app-store
 * review cycle. Trade-offs this buys us: needs network connectivity (no
 * offline mode in v1), and needs deliberate native-feeling touches (status
 * bar, splash screen, haptics, share sheet, safe-area handling) so the app
 * doesn't read as "just a website" under Apple App Review Guideline 4.2.
 *
 * `www/` is a placeholder only — Capacitor's CLI tooling expects a webDir
 * to exist even though `server.url` overrides it at runtime.
 */
const configuredMobileAppUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  "https://dodgy-deal-mobile.vercel.app";

let mobileAppUrl: string;
try {
  const parsedUrl = new URL(configuredMobileAppUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname.endsWith(".example.com")) {
    throw new Error("the URL must be a real HTTPS deployment, not a placeholder domain");
  }
  mobileAppUrl = parsedUrl.toString();
} catch (error) {
  const detail = error instanceof Error ? error.message : "invalid URL";
  throw new Error(`Invalid CAPACITOR_SERVER_URL: ${detail}`);
}

const config: CapacitorConfig = {
  appId: "nz.dodgydeals.app",
  appName: "Dodgy Deals",
  webDir: "www",
  // Match the WebView/loading surface to the app's base background so the
  // iOS safe-area region below the floating bottom nav does not show as a
  // separate pale strip.
  backgroundColor: "#efefed",
  server: {
    // Set CAPACITOR_SERVER_URL to the deployed apps/mobile URL before syncing
    // or archiving. The config intentionally has no fallback: an unreachable
    // placeholder leaves Capacitor's launch splash visible forever.
    url: mobileAppUrl,
    cleartext: false,
  },
  ios: {
    // The web UI owns safe-area spacing via env(safe-area-inset-*).
    // Automatic UIScrollView insets would apply the iPhone bottom inset twice,
    // leaving the floating navigation pill too high on physical devices.
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#faf9f5",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#17170f",
      overlaysWebView: false,
    },
  },
};

export default config;
