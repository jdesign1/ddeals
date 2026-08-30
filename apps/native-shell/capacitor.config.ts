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
const config: CapacitorConfig = {
  appId: "nz.dodgydeals.app",
  appName: "Dodgy Deals",
  webDir: "www",
  // Match the WebView/loading surface to the app's base background so the
  // iOS safe-area region below the floating bottom nav does not show as a
  // separate pale strip.
  backgroundColor: "#efefed",
  server: {
    // TODO(Phase 2): point at the real production apps/mobile Vercel domain
    // once it's deployed. Use the Vercel preview URL during development.
    url: "https://app.dodgydeals.example.com",
    cleartext: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#006948",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#006948",
    },
  },
};

export default config;
