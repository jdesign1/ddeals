# Prototype Change History

Change log for the mobile-app prototype line (React/TSX, AI Studio-derived). Current active file: `Prototype/index.html` in this repo, mirrored/pushed to the separate deploy repo [`github.com/jdesign1/ddealsprototype`](https://github.com/jdesign1/ddealsprototype), served live at **https://jdesign1.github.io/ddealsprototype/**.

Full backend/data-layer history (Supabase schema, scrapers, identity matching, etc.) stays in `project.md` — this file only tracks the prototype's own front-end history.

---

## 2026-07-09 — Connected to live Supabase data (product search, deals, price history)

- `mockProducts` (the 10-item hardcoded array) is now `FALLBACK_PRODUCTS`; a mutable `mockProducts` binding gets swapped to real Supabase data on boot before first render, or silently falls back to the old mock data if the fetch fails. Login (still "Skip for now") and tracked items/alerts/history stay local mock state — full backend wiring (real auth, persisted lists) was scoped out as a separate task.
- Fetches `current_prices` (current specials), `products`, `stores`, `price_history` directly via the anon key (same embedded-anon-key + RLS pattern as `matching-dashboard.html`), caps at 220 products prioritising multi-store deals, and classifies each deal GENUINE/DODGY/MARGINAL/UNKNOWN client-side with the same thresholds as `analyser.py`/`dodgy_deals_view.sql` — the deployed `dodgy_deals` view turned out to be stale (missing columns vs. the checked-in SQL, returns 0 rows), so the classifier was ported into the prototype directly rather than queried from the view. Full details and peer-review steps in `project.md`.
- "My List" / "All Checks" (history) / alerts seed content is now generated from whichever real products actually load, since the old hardcoded seed data pointed at mock product ids that no longer exist.
- Caveat: `price_history` is sparse for most products (often 1-2 rows), so most current specials skew GENUINE/MARGINAL rather than DODGY — a data-depth limitation, not a bug in the classifier.

---

## 2026-07-09 — Connected `Prototype/` to the `ddealsprototype` deploy repo, pushed live fix

- Cloned `github.com/jdesign1/ddealsprototype` into `ddealsprototype/` inside this project folder (separate nested git repo, own remote/history; added to `.gitignore` here so this repo doesn't try to track it as a submodule).
- Diffed the live repo's committed `index.html` against `Prototype/index.html` — found they were byte-identical (same broken Save-Page-As export), meaning the **live GitHub Pages site was broken**, not just the local copy.
- Copied the fixed `Prototype/index.html` into `ddealsprototype/index.html`, committed, pushed to `main` (`2d51e2a..f103d7c`).
- Auth: sandbox had no GitHub credentials configured. User generated a fine-grained PAT (repo-scoped to `ddealsprototype`, Contents: read/write), used inline in the push URL only (never written to `.git/config`), user advised to revoke it after use.
- Verified post-push via `raw.githubusercontent.com`: CDN refs present, no `index_files` refs remain.

## 2026-07-09 — `Prototype/index.html` established as the sole active prototype file

- User added `Prototype/index.html` — a browser "Save Page As" export of `dodgy-deal-standalone.html`. The export rewrote CDN `<script>`/`<link>` tags to local `./index_files/...` paths that were never actually saved, so the file loaded with no Tailwind, no Google Fonts, no Babel standalone (dead on arrival).
- **Fix:** restored the three broken refs to their real CDN URLs — Google Fonts `css2` stylesheet, `https://cdn.tailwindcss.com`, `https://unpkg.com/@babel/standalone@7.24.7/babel.min.js`. Dropped the stray "saved from url=..." HTML comment.
- Confirmed via diff against the last committed `dodgy-deal-standalone.html` that the actual `app-source` script (the real React/TSX app) was unchanged — this export already included the later `jsx-runtime`/classic-runtime fix (see below), i.e. it was the newer, already-patched version; only the head refs were broken by the save.
- **Peer review:** extracted `#app-source`, compiled with `@babel/core@7.24.7` + `preset-typescript`/`preset-react` (matching the exact in-file `@babel/standalone@7.24.7` config) — clean compile, no `jsx-runtime` reference. Compiled to CommonJS and ran in Node + jsdom against the real pinned `react`/`react-dom`: self-renders the Login screen ("DODGY DEAL" / "Log In" / "Skip for now"), no fatal-error banner.
- **Old files retired:** `dodgy-deal-standalone.html`, `dodgy-deal-mobile-prototype.html`, and `dodgy-deals-prototype.html` all removed from the project root — `Prototype/index.html` is now the one and only active prototype file.

## 2026-07-09 — `dodgy-deal-standalone.html`: `react/jsx-runtime` fix

- First hand-off to a real browser failed: `Failed to resolve module specifier "react/jsx-runtime"`. Babel's `react` preset defaults to the automatic JSX runtime, which imports `react/jsx-runtime` separately from `react`, and that specifier wasn't in the import map.
- Fixed by pinning the Babel `react` preset to `{ runtime: 'classic' }` (matches the `React.createElement`-based output the rest of the setup assumes, since every component already does `import React from 'react'`).
- Re-verified: compiled output no longer references `jsx-runtime`, uses `React.createElement` as expected.

## 2026-07-09 — `dodgy-deal-standalone.html`: real React/TypeScript source conversion

- User shared a second, different AI Studio app link — a newer React/Vite mock of the same product idea, distinct from the older Supabase-wired `dodgy-deals-prototype.html`.
- Used AI Studio's "Download as .zip" project export (with explicit permission) to get the *real* source (`App.tsx`, `types.ts`, `data/products.ts`, `index.css`, 11 `components/*.tsx` files) rather than screen-scraping the AI Studio code editor.
- Built `dodgy-deal-standalone.html`: single file, no build step to *run*, but is the actual React/TS source — Tailwind via `cdn.tailwindcss.com` play build (custom fonts + `fadeIn`/`scaleUp` keyframes), React 18 + ReactDOM + `lucide-react` + `motion` (Framer Motion) + `recharts` loaded from `esm.sh` via an import map, all 11 components + `App.tsx` concatenated into one module scope, Babel standalone compiles the TSX in-browser to a blob URL and `import()`s it.
- **Peer review:** local `file://` navigation isn't available in the sandbox, so verified by compiling the exact `#app-source` text with the real Babel config and running it in Node + jsdom against the real pinned packages — scripted clicks through login skip → tab switching → search → "Check Deals" → `DealModal` open/close → "All Checks" → Scanner modal. No thrown errors.

## Earlier — AI Studio "Dodgy Deal" Mobile Prototype recreated as standalone HTML

- First pass at the newer AI Studio design: read the AI Studio in-browser Code tab directly (App.tsx, index.css, types.ts, data/products.ts, 9 components) since no file-export path was usable at the time.
- Built `dodgy-deal-mobile-prototype.html`: single file, Tailwind CDN + Google Fonts, vanilla JS (no build step) — a hand-recreation, not the real source. Phone-frame mockup: Login/Signup, Home, Search Results, My List, Alerts, All Checks, Deal Stats, How It Works, Deal Detail modal, Scanner modal. 10 mock products modelled on the real `products.ts` shape.
- Superseded by the real React/TS source conversion above once a proper export path was found — rewriting a stateful React app by hand in vanilla JS risked behavioral drift.
- Removed from the project root on 2026-07-09 (see above).

## Superseded — `dodgy-deals-prototype.html` (original Supabase-wired prototype)

- The original prototype: real Supabase-backed app (homepage, search results, deal result with 6-level dodginess scale, tracked items) reading live retailer price data. Extensive iteration history (reviewed exact-SKU links, `current_prices` RLS fixes, comparison-ranker "more ways to compare" lanes, meat/produce variant gates, etc.) — see `project.md` for the full backend-tied history.
- Removed from the project root on 2026-07-09 in favor of the AI Studio-derived `Prototype/index.html` line above.
