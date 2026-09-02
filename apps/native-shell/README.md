# native-shell

Capacitor wrapper for the iOS/Android apps. No app logic lives here — it's a thin native shell that loads the deployed `apps/mobile` Next.js app over HTTPS (see `capacitor.config.ts` and the "Native iOS/Android App" plan in `project.md` for why remote-URL loading was chosen over a bundled static export).

## iOS setup

The iOS platform project is checked in under `ios/`. The wrapper defaults to
the stable Vercel domain below. Set `CAPACITOR_SERVER_URL` only when switching
to another preview or production deployment:

```bash
npm run sync:ios
npm run open:ios
```

The config defaults to `https://dodgy-deal-mobile.vercel.app`. Set
`CAPACITOR_SERVER_URL` when switching to a different preview or production
deployment. It rejects placeholder domains and non-HTTPS URLs so a build
cannot be produced that hangs on the launch splash waiting for a site that
does not exist.

In Xcode, select the `App` target and set your Apple Developer Team under
Signing & Capabilities. Update the bundle identifier if `nz.dodgydeals.app`
is not the identifier registered in your Apple Developer account. Then choose
`Product > Archive`, validate the archive, and upload it to App Store Connect
for TestFlight.

The iOS deployment target is iOS 15.0 or later to meet App Store Connect's
current upload requirements.

## Remaining release polish

- The iOS launch storyboard shows the static Dodgy Deal logo-and-text lockup
  on the paper-colour background while the WebView starts. The one-time
  branded small-to-large, glance-left, wink, and fade-out sequence in
  `apps/mobile/src/components/LaunchSplash.tsx` follows it once the WebView
  loads. The lockup source remains available at
  `branding/dodgy-deal-splash.svg`.
- Native plugins are declared in `package.json` (status bar, splash screen,
  haptics, share, app); the splash configuration is now wired to hand off to
  the web animation automatically.
- Barcode scanning plugin isn't added yet — the Stitch design has a "Scan Barcode" entry point (S4, S8) that will need `@capacitor/barcode-scanning` or similar once that screen is built.

## Commands (once platforms are added)

```
npm run sync:ios     # sync web assets + config into the iOS project
npm run open:ios      # open the Xcode project
npm run open:android  # open the Android Studio project
```
