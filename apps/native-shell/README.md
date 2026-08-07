# native-shell

Capacitor wrapper for the iOS/Android apps. No app logic lives here — it's a thin native shell that loads the deployed `apps/mobile` Next.js app over HTTPS (see `capacitor.config.ts` and the "Native iOS/Android App" plan in `project.md` for why remote-URL loading was chosen over a bundled static export).

## Not yet done (Phase 2 of the plan)

- `ios/` and `android/` platform folders haven't been generated yet — run `npm run add:ios` / `npm run add:android` from this directory once `apps/mobile` has a real deployed URL to point at (needs Xcode / Android Studio + CocoaPods installed locally, not available in the Cowork sandbox).
- `capacitor.config.ts`'s `server.url` is a placeholder — swap in the real Vercel preview/production domain.
- App icons + splash screen assets still need generating from `Prototype/Logo final/`.
- Native plugins are declared in `package.json` (status bar, splash screen, haptics, share, app) but not yet wired into any UI code — that happens once `apps/mobile` screens exist to call them from.
- Barcode scanning plugin isn't added yet — the Stitch design has a "Scan Barcode" entry point (S4, S8) that will need `@capacitor/barcode-scanning` or similar once that screen is built.

## Commands (once platforms are added)

```
npm run sync         # capacitor sync web assets + config into native projects
npm run open:ios      # open the Xcode project
npm run open:android  # open the Android Studio project
```
