# Prototype Change History

Change log for the mobile-app prototype line (React/TSX, AI Studio-derived). Current active file: `Prototype/index.html` in this repo, mirrored/pushed to the separate deploy repo [`github.com/jdesign1/ddealsprototype`](https://github.com/jdesign1/ddealsprototype), served live at **https://jdesign1.github.io/ddealsprototype/**.

Full backend/data-layer history (Supabase schema, scrapers, identity matching, etc.) stays in `project.md` — this file only tracks the prototype's own front-end history.

**Rule for any agent pushing to the deploy repo:** `ddealsprototype/changes.md` is a tracked file in that separate repo, not just `index.html`. When mirroring a change over (`cp ../Prototype/index.html index.html`), always also `cp ../Prototype/changes.md changes.md` and commit both together (`git add index.html changes.md`). Pushing `index.html` alone leaves the deploy repo's own changes.md silently out of sync with what's actually live.

---

## 2026-07-10 — Search relevance ranking (category matches now outrank incidental keyword hits)

User reported not being able to find "butter" or "milk" via search. Category text was already part of the match (name/brand/category all searched), and the data itself is fine — real milk/butter products with correct categories and live prices are all in the DB, and load on page 0 of the streamed catalogue. The actual bug: no relevance ranking existed, so results fell back to cheapest-price-first, and a cheap chocolate bar ("Dairy Milk"), biscuit ("Milk Arrowroot"), or sauce ("Butter Chicken") that merely *mentions* the word buried the real category items a shopper was after.

- Added `getSearchRelevance()` — tokenises the query and product name/brand/category into whole words (so "milk" matches "Standard Milk" but not "Milky"/"Buttermilk-flavoured") and scores category match (4) > name match (3) > brand match (2) > the existing substring-only fallback (1).
- `sortedProducts` now sorts by this relevance score first; the user's chosen cheapest/discount/dodgy-rating sort is applied only as a tiebreaker within the same relevance tier, not as the primary order.
- Checked against live data: "milk"/"butter" now lead with genuine dairy-aisle items (coconut/almond/oat milk, Anchor/Westgold butter, butter-vs-margarine spreads — all actually co-categorised with dairy in the retailers' own taxonomy) ahead of incidental mentions. Some overlap between butter and spreads/margarine, or milk and "milk chocolate" labelling, is expected — that's real shared vocabulary in supermarket category taxonomies, not a bug.
- **Peer review:** compiled clean. jsdom + live-Supabase harness re-checked "coffee"/"weetbix" (still clean, on-target) plus "milk"/"butter" (79 and 68 real results, top-6 now genuinely category-relevant).

## 2026-07-10 — Sentence-case search input, camera-based scanner rebuild, "Weetbix" search fix

Three fixes requested together.

- **Search input case:** the input had a Tailwind `uppercase` class forcing all-caps display regardless of what was typed. Removed it — text now shows exactly as entered.
- **Scanner rebuilt around a real camera:** removed `SCANNER_PRESETS` (3 hardcoded fake price tags) and the fake `setTimeout`-based "audit" that fabricated a Dodgy/Real Deal verdict and silently logged it to history. Replaced with two real actions — "Scan Barcode" (hidden `<input type="file" accept="image/*" capture="environment">`, the standard way a web page triggers the device's actual camera app) and "Upload Photo" (same without `capture`, opens the gallery). Either shows a preview with "Retake" or "Search for This Item" (closes the scanner, switches to the search tab via a new `onSearchForItem` prop, so the user looks the item up through the app's real live classifier instead of a fabricated result). Removed the now-unused `handleAddHistory` in `App()`.
- **"Weetbix" search fix:** confirmed live in the DB — it's there (12 real "Sanitarium Weet-Bix" rows with live prices), just spelled with a hyphen. Search was a naive substring check, so "Weetbix" (no hyphen) never matched "weet-bix". Added `normalizeSearchText()` (strips non-alphanumerics before comparing, same idea already used for store-name matching) to both `SearchTab`'s product filter and `HistoryTab`'s own history search.
- **Peer review:** compiled clean. jsdom + live-Supabase harness confirmed no `uppercase` class and typed case preserved; "Weetbix" search returns 8 real items; scanner has no preset/audit text, both camera (`capture="environment"`) and gallery file inputs present and wired, preview + "Search for This Item" flow works end to end.

## 2026-07-10 — Global nav bar, scan button relocated to search bar, live full-screen search, pill carousel

Four related UI changes requested together.

- **Global `AppHeader`:** extracted the home screen's header (logo/back-arrow, profile icon + dropdown menu) into a shared `AppHeader` component. `DealModal` (both its main view and "Cheaper Alternatives" sub-view) previously had its own bespoke, non-interactive header (dead `CircleUser` icon) — now uses the same `AppHeader`, wired to close the modal and switch tabs via new `onNavigateToHowItWorks`/`onNavigateToManageAccount`/`onLogout` props.
- **Scan button relocated:** removed the `camera-scan-fab` floating button from `HistoryTab` (All Checks). The home search bar's old "Search" submit button is now a barcode-scan icon that opens `ScannerModal` via a new `onOpenScanner` prop.
- **Full-screen search + live suggestions:** typing any character now opens a full-screen search overlay (same phone-frame convention as other modals) with the search bar pinned at the top; results now live-update on every keystroke (previously required hitting "Search") instead of only on submit. Below 3 characters shows a "Keep typing..." hint; 3+ characters shows results immediately. Backspacing to empty, the X, or the back arrow all close the overlay.
- **Pill carousel:** "Filter by Supermarket" pills changed from wrapping to a single-row horizontal scroll (`overflow-x-auto`, new `.hide-scrollbar` CSS utility) so the row doesn't eat vertical space.
- **Peer review:** compiled clean. jsdom + live-Supabase harness scripted the full flow — profile menu, scan button, typing → full-screen view → live results, pill carousel classes, All Checks (no scan FAB), DealModal profile menu + navigation. One false alarm from the test's own Framer Motion stub (recreating a new component identity per render, causing spurious remounts) was found and fixed in the harness — not a real app bug, confirmed by re-running after the stub fix.

## 2026-07-10 — Real product images on product cards, cleaned to a plain white background

- Product cards across `SearchTab` (home widget + search results), `TrackedTab`, `HistoryTab`, and `DealModal` (all 4 product-summary blocks) showed a static gray "Product Image" placeholder box instead of an actual photo, even though the live data layer already carried a real `products.image_url` per item. Added a shared `ProductImage` component (real `<img>`, falls back to a placehold.co image on load error) and swapped it in at all 8 locations.
- Follow-up: removed the background colour and border from all 8 image containers so photos sit directly on the card's white background instead of in a shaded/outlined box.
- **Peer review:** compiled clean both times. jsdom + live-Supabase harness confirmed real `fsimg.co.nz` photo URLs render in search results, the deal modal, and My List (92/92, then 4/4 cards respectively).

## 2026-07-10 — Fixed stale hardcoded "coffee" state when returning to home

- `DealModal`'s `onClose` handler hardcoded `setSearchInputValue('coffee')`/`setActiveSearchQuery('coffee')` before returning to the search tab — since home is just the search tab with an empty query, closing a deal from the home screen replaced the empty query with a fixed "coffee" search instead of showing the real home view.
- Fixed by resetting both to `''` instead, so closing the modal returns to a genuinely empty query and the home screen renders normally.
- **Peer review:** compiled clean; confirmed no other hardcoded query resets exist anywhere in the file.

## 2026-07-10 — Full catalogue browsing: every item is now findable, not just current specials

Follow-up to the 2026-07-09 "no cap" work below, after the user asked whether the app pulls every item the supermarkets stock or just specials, and whether users should be able to find any item (to see its price history) even when it isn't currently discounted. It didn't -- `loadLiveProducts()` queried `current_prices?...&is_special=eq.true`, so anything not actively on special was invisible to search/browse, even though `price_history` already had regular-price data for those items.

- Dropped the `is_special=eq.true` filter -- `loadLiveProducts()` now fetches every row in `current_prices` (~12.7k rows live vs. the ~4.4k that were on special). DB check: of 12,449 rows in the `DB backup` snapshot, 7,984 (64%) were non-special and previously excluded entirely.
- Per-row classification now branches: `is_special=true` rows still run through the real `classifySpecial()` DODGY/GENUINE/MARGINAL/UNKNOWN logic (unchanged). `is_special=false` rows get a neutral `{ dealType: 'Fair Price', isOnSpecial: false }` entry -- no fabricated verdict, just the regular shelf price -- so the item is still browsable/searchable and its `price_history` (which was never special-filtered) is visible.
- Match-group processing order now puts groups with an active special first, then richest cross-store comparisons, so the specials-first feel of the home/search experience is preserved -- plain items still load, just in later pages.
- Search results ("Results for '...'", renamed from "Specials for '...'") now list every match, tagged with an "On Special" or "Regular Price" pill next to the price. The "Your Items on Special" home-screen widget was tightened to only count items with an actual active special (`isOnSpecial !== false`), since `currentDeals.length > 0` stopped being a reliable "is this on sale" signal once regular-priced rows are included too.
- `DealModal`'s verdict banner (Real Saver / Fair Deal / Dodgy Deal) now shows "Regular Price" instead when `deal.isOnSpecial === false`, rather than forcing a dodgy/genuine judgement onto an item that was never marketed as a deal.
- **Perf fix found while scoping this:** `fetchAllRows()` paged sequentially (one 1000-row request at a time), fine for ~4.4k rows but measured ~6s for the full ~12.7k-row `current_prices` table -- would have pushed first-render latency well past the previous ~3s. Rewrote it to fetch page 1 with `Prefer: count=exact`, read the true row count off `Content-Range`, then fire every remaining page in parallel: measured ~1.5s for the same query, 4x faster. `fetchByIds()`'s chunked `in.(...)` lookups were similarly sequential and are now parallelised too (a page of match-groups without the specials filter can span several hundred product ids, i.e. several chunks).
- **Peer review:** extracted `#app-source`, compiled with `@babel/core@7.24.7` (`preset-typescript` + `preset-react` classic runtime + `plugin-transform-modules-commonjs`, matching the in-file Babel-standalone config), ran in Node 22 + jsdom against the real pinned `react`/`react-dom@18.3.1` with real live network calls to Supabase (lucide-react/motion/recharts stubbed as inert components for the test only). Scripted: skip login → search "a" → 10,694 items found (vs. the old ~3,459-item deals-only ceiling), both "On Special" and "Regular Price" pills present → opened a non-special item's deal modal (Chupa Chups Lollypop, PAK'nSAVE) → showed "Regular Price", no fabricated verdict, no crash → separately opened a genuine special (Cadbury Dairy Milk) → showed "Real Saver" unchanged. No thrown errors (only harmless React `act()` test-environment warnings).

## 2026-07-09 — Rebuilt product grouping on real cross-store matches, removed the product cap, added paginated/progressive loading

Follow-up to the same day's Supabase connection work below, after the user asked whether search surfaced the ~600 reviewed cross-store product matches (e.g. Pak'nSave ↔ New World ↔ Woolworths) already in the database. It didn't — the first pass only merged deals that happened to share the exact same `product_id`, which almost never spans stores since each retailer's catalogue has its own row per product.

- Added `buildMatchIndex()`: union-find over `products.canonical_product_id` (exact-SKU matches, 272 linked products / 158 groups) and `app_comparable_family_links` (332 reviewed "fair to compare" pairs, spans all stores not just Foodstuffs). Current specials are now grouped by resolved match-group id instead of raw `product_id`, so genuinely matched items from different retailer catalogue rows land on one product card.
- Removed the 220-product cap entirely, per explicit instruction — all ~3,459 qualifying current specials (out of 4,276 total) now load, not a capped subset.
- Replaced the single blocking fetch with **paginated, progressive loading**: groups are processed 250 at a time (richest, most-multi-store groups first), each page's products/price-history fetch stays bounded regardless of total catalogue size, and results stream in via an `onUpdate` callback. The app only blocks on the *first* page (~3s) before rendering; later pages arrive in the background (~16s total) and trigger a re-render through a small tick-based subscription in `App()`, without a full remount.
- **Bug found via the render harness, not manually:** the identity-matching pipeline occasionally links two distinct retailer catalogue rows from the *same* store into one match group (confirmed live: two separate Pak'nSave rows both canonical-linked to one Woolworths "Anchor Butter" row) — a pre-existing data-quality quirk in the underlying tables, not something introduced here. This produced two `Pak'nSave` entries on one card, which the existing UI can't render safely since two places key list items by `deal.store` alone (a React "duplicate key" warning surfaced this). Fixed by deduplicating to the best (lowest) price per store within a group, in the data layer rather than touching render code.
- Live result: 19 product cards now show a genuine multi-store comparison (up from ~0 meaningful ones before); the rest are single-store cards, which is an honest reflection of how rarely the same matched item is on special at two stores simultaneously right now, not a bug.

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
