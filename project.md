
## 2026-08-20 (cont. 11) -- packages/shared/src/data.ts: root cause of "products already on your list still show Plus, not a tick, on Home/Search" -- fixed

**Ask:** "Products on your list, still show a plus icon, rather than a tick - when seen on the home page or search product cards." (bug report against the previous entry's fix, which added `AddToListButton.tsx`'s real "already saved" state, since `AddToListButton` is only ever rendered by `ProductListCard.tsx`, which both Home and Search use for every product card).

**Investigation:** Traced `product.id` through both flows -- `ProductListCard.tsx` passes `product.id` straight to `AddToListButton`, and `data.ts`'s `id: row.product_id` (the Lists-page-only `buildListItemProductCard` path) confirmed the general shape was sound. Ruled out an outright ID-mismatch and ruled out an auth-timing/silent-fetch-failure theory (checked `auth-context.tsx`'s `getSession()` + `onAuthStateChange` wiring -- the new effect's `[user, productId]` deps correctly re-fire once `user` hydrates, same as every other `useAuth()` consumer already relies on).

**Root cause found:** Home/Search cards come from `loadLiveProducts()` -> `buildProductCardsFromSpecials()`, whose `product.id` is NOT a stable database id -- it's a union-find match-group id computed by `buildMatchIndex()` over `products.canonical_product_id` and `app_comparable_family_links`. That id becomes exactly what `addItemToList` writes to `list_items.product_id`. `buildMatchIndex`'s old `union()` picked whichever id happened to be unioned in LAST as the new root -- and neither of its two source queries has an `ORDER BY`, so Postgres/PostgREST never guaranteed the same row order between independent fetches (the 15-min `dodgy_deals_cache` refresh, autovacuum, or just a different scan plan is enough to reorder rows). So the SAME real-world matched product could resolve to a *different* group id on a later page load than the one it was added to a list under -- `fetchListIdsContainingProduct` (previous entry) then correctly finds zero rows for the NEW id, even though the product genuinely is saved under the OLD one. Not a display bug in `AddToListButton` at all -- that component was working exactly as written the whole time, against an input (`productId`) that wasn't stable.

**Fix:** `buildMatchIndex`'s `union()` now always keeps the lexicographically SMALLER of the two roots, deterministically, regardless of which order canonical/comparable rows arrive in or which order `union()` calls happen. For any fixed set of union edges (which depends only on which rows exist, not their fetch order), this converges every id in a connected component to that component's global-minimum id every time -- verified by hand for both processing orders of a 3-node chain, and covered by a new test.

**Flagged, not silently glossed over:** this is a going-forward fix only. Any list item already saved under a pre-fix, non-deterministic group id (very plausibly including this session's own test-account data) can still mismatch once against the new deterministic id the first time that group is re-resolved -- there's no tool available in this session to retroactively migrate `list_items.product_id` rows, and no way to know from here which of Jay's existing saved items (if any) are affected. If a specific already-saved item still shows Plus after this fix, re-adding it once will re-save it under the now-stable id.

**Verified:** `npx tsc --noEmit -p packages/shared/tsconfig.json` clean. `npm test` (packages/shared) -- 56/56 passing (55 previous + 1 new: "buildMatchIndex: find() is stable regardless of row fetch order", which fetches the same 3-id match group via two different row orders and asserts `find()` returns the identical root both times -- this test would have failed against the old union() rule). No eslint config exists for `packages/shared` (lint has only ever run against `apps/mobile`'s `.tsx` files this session, consistent with every prior entry) -- not run here, not applicable. Dev-server log: `data.ts` change triggered the same benign "Fast Refresh had to perform a full reload" notice every prior `packages/shared` edit this session has caused, followed by a clean compile, no new errors.

**Files touched:** `packages/shared/src/data.ts` (`buildMatchIndex`'s `union()` deterministic-root fix + doc comment), `packages/shared/src/data.test.ts` (new regression test). `AddToListButton.tsx` itself was NOT touched -- it needed no fix, the previous entry's implementation was correct against unstable input.

**Not committed** -- left in the working tree per Jay's standing "own call on when to commit."

## 2026-08-20 (cont. 12) -- 5 separate asks: Share button circle, black tick, Account sheet restyle, Lists chevron, Lists page caching

**Ask 1 (Jay):** "Add a circle around the share button on the deal assessment pages, and give it a white fill also to match the add to list icon." -- `app/deal/[id]/[store]/page.tsx`'s Share button was flagged back on 2026-08-17 as a follow-up candidate ("giving it a white circle would be adding a new shape Jay didn't ask for") and left bare until now. Given the exact same class string `AddToListButton`'s own `buttonClassName` override on this same page already carries (`flex h-7 w-7 items-center justify-center rounded-full border border-stone-900 bg-white text-stone-900`), so the two sit as a matched pair. `Share2` icon shrunk `h-[18px]` -> `h-4 w-4` to match the Plus/Check icon size inside the same circle.

**Ask 2 (Jay):** "Make the added to list tick icon black." -- `AddToListButton.tsx`'s trigger `Check` icon was tinted `var(--color-brand-primary)` green (added last entry, 2026-08-20 cont. 9). Dropped that explicit `style` override entirely so the icon now inherits `currentColor` from whichever `buttonClassName` the caller passed (black/`text-stone-900` on every current caller), same as the `Plus` branch already did. The SHEET's own per-list checkmark (inside the "Add to list" bottom sheet) was deliberately left green -- Jay's wording ("the added to list tick icon", singular) matches the trigger icon this session's other asks keep referring to, not the internal picker.

**Ask 3 (Jay):** "Make Account bottom sheet items use Manrope text, enlarge the icons slightly, and give more gap between items in the account list, remove the line border separators." -- `AppHeader.tsx`'s account bottom sheet (4 possible rows: How Dodgy Deal works / Manage account / Log out / Create account-log in): added `font-display` to every row (that utility IS Manrope -- `--font-display: var(--font-manrope)`, globals.css; rows previously had no font-family class, falling through to the Inter body default). Icons `h-4 w-4` -> `h-5 w-5` (matches the sheet's own close-button icon size). Dropped `border-t border-stone-100` from every row after the first. `py-4` -> `py-5` on every row (the wrapping `<div>`'s children are plain block rows, not a flex column, so per-row padding is what actually controls inter-row spacing, not a `gap` on the wrapper).

**Ask 4 (Jay):** "On lists - move the collapse chevron to the right side of the cards, and make the icon larger." -- `lists/page.tsx`'s `ListCard` view-items toggle button was `w-fit` with the item-count text and `ChevronDown` sitting side by side, both left-aligned. Switched to `w-full` + `justify-between` (dropped the now-redundant `gap-1`) so the chevron lands at the card's own right inset -- the same edge the pencil/trash icons already sit against -- while the item-count text stays put on the left. Icon `h-3.5 w-3.5` -> `h-5 w-5`.

**Ask 5 (Jay):** "Can we cache the lists in a smart way? so they don't need to be loaded each time you select the lists tab." -- `lists/page.tsx`'s composite fetch (own lists + every list's items + price lookups + product meta + item cards -- 4 real round trips) used to run in full on EVERY mount, and this page mounts fresh every single time the Lists tab is selected (real client-side route change, no persisted layout state). Moved that composite fetch verbatim into the shared package as `loadListsPageData` (`lists.ts`), wrapped in a per-user, 60s-TTL, request-dedup cache -- same `{promise, resolvedAt}` shape `data.ts`'s own `loadLiveProductsDeduped` already established for the specials catalogue, keyed per `userId` here since this data is user-scoped rather than a shared public catalogue. Freshness is primarily enforced by explicit invalidation, not the TTL: a new `invalidateListsPageCache(userId?)` is called (a) by `lists/page.tsx`'s own `reload()`, right before refetching, so this page's own create/delete/rename/remove-item always show immediately, and (b) by `AddToListButton.tsx`'s `handleToggle`, since that component mutates the exact same `list_items` rows from Home/Search cards without ever rendering the Lists page itself -- without (b), an add/remove made from a product card would leave the Lists tab showing a stale item count/total for up to 60s the next time it's opened. The 60s TTL is a pure backstop for any future write path that might skip the invalidator, not the real freshness mechanism.

**Verified:** `npx tsc --noEmit` clean on BOTH `packages/shared` and `apps/mobile`. `npm test` (packages/shared) -- 60/60 passing (56 previous + 4 new: 2 `loadListsPageData` dedup/per-user tests, 1 `invalidateListsPageCache` refetch-after-invalidation test, 1 clear-all-users test -- all use a fake Supabase-client-shaped thenable builder with empty lists, since an empty list set makes `fetchItemsForLists`/`fetchListPriceLookups`/`fetchByIds` all short-circuit to zero extra calls, so counting `client.from()` invocations alone proves the cache mechanics without also stubbing `fetch`). `npx eslint` clean on all 4 touched `apps/mobile` `.tsx` files. Dev-server log: a genuine but almost certainly transient "Export ... doesn't exist in target module" HMR error appeared in the dev log for `AddToListButton.tsx`/`lists/page.tsx`, timestamped inside the exact ~1-second window this session's 6-file batch commit was landing -- i.e. Jay's browser very likely re-requested the page mid-write, before `lists.ts`'s own commit (last in the batch) had finished landing on disk. Confirmed NOT a real code issue three ways: (1) `tsc` across both packages, run fresh AFTER all 6 files were fully committed, resolves every one of these exact imports with zero errors; (2) direct `grep` of the live on-disk `lists.ts` confirms both `export function loadListsPageData` and `export function invalidateListsPageCache` are present verbatim; (3) forcing a real content-mutate-then-restore on `lists.ts` (confirmed via md5sum match before/after) produced no new log entries at all, meaning no new page request has hit the dev server since the original error -- Turbopack compiles routes on demand, so an idle/backgrounded browser tab simply won't re-report until it's reloaded. Flagged rather than silently assumed fixed: if this error is still showing in Jay's browser, a hard refresh (or dev server restart) should clear it, since the underlying export is genuinely present and type-correct.

**Files touched:** `apps/mobile/src/app/deal/[id]/[store]/page.tsx` (Share button), `apps/mobile/src/components/AddToListButton.tsx` (tick color + cache invalidation on toggle), `apps/mobile/src/components/AppHeader.tsx` (account sheet restyle), `apps/mobile/src/app/lists/page.tsx` (chevron + switched to shared cached fetch), `packages/shared/src/lists.ts` (`loadListsPageData`/`invalidateListsPageCache`/`ListsPageData`, moved+wrapped the old page-local composite fetch), `packages/shared/src/lists.test.ts` (4 new cache tests).

**Not committed** -- left in the working tree per Jay's standing "own call on when to commit."

## 2026-08-20 (cont. 13) -- ListItemProductCard.tsx + lists/page.tsx: swipe-left to remove a list item, replacing the tap-X trigger

**Ask (Jay):** "to remove an item from a list, use the swipe left gesture, then give the remove warning, keep the card the same size in the warning."

**Fix:** Both list-item row shapes (`ListItemProductCard.tsx` for items with a real `ProductCard`, `FallbackItemRow` in `lists/page.tsx` for the rare item with no current price) had their remove trigger changed from tapping a top-right/trailing X icon to a swipe-left gesture on the row itself. Implemented with `motion.div`'s own `drag="x"`, `dragConstraints={{ left: 0, right: 0 }}`, and `dragElastic={0.5}` -- constraining drag to a single point still lets the row visibly travel left under a finger/cursor (rubber-band feel), but on release `motion` springs it back to `x: 0` on its own with no manual reset code; `onDragEnd` just checks `info.offset.x` against a `SWIPE_THRESHOLD` (70px, defined once per file since it's page/component-local, not exported) to decide whether to flip `confirmingRemove` on. Drag is disabled outright once `confirmingRemove` is true. `style={{ touchAction: "pan-y" }}` added so vertical page scroll still passes through natively while the horizontal swipe is captured -- without it a vertical scroll gesture starting on a list item could get contested by the drag handler.

"keep the card the same size in the warning" -- the OLD confirm state was a separate `return` branch (`ListItemProductCard.tsx`) / a separate box (`FallbackItemRow`) with different, smaller classes than the normal state, which visibly shrank the row when confirming (most noticeable on `ListItemProductCard.tsx`, which lost its entire 56px image block). Fixed by collapsing both states into ONE element with ONE class string -- only the children inside swap between normal content and the "Remove {name}?" + tick/cross prompt -- so the box's footprint literally cannot differ between states, not just "happens to match" by hand-tuning two separate class strings. `FallbackItemRow`'s normal-state padding widened `px-1` -> `px-2 py-1` to match its own confirm state for the same reason.

**Flagged, not silently decided:** the X button is gone outright, and there is now NO non-drag (keyboard/screen-reader/switch-access) path to remove a list item -- a real accessibility regression versus the tap-X-then-confirm flow this replaces. This is a direct, literal read of Jay's ask ("use the swipe left gesture" to remove, not "add a swipe gesture alongside the X"), but flagged here as a fast-follow candidate if a non-gesture fallback is wanted back.

**Verified:** `npx tsc --noEmit` clean. `npx eslint` clean on both touched files. Dev server log confirmed restarted clean with zero ERROR entries after these files landed (log had rotated since the last entry, 5 fresh lines, `grep -c '"level":"ERROR"'` = 0) -- not yet re-visited in a live browser tab this session to confirm the gesture feels right, worth Jay's own hands-on check.

**Files touched:** `apps/mobile/src/components/ListItemProductCard.tsx`, `apps/mobile/src/app/lists/page.tsx` (`FallbackItemRow`).

**Not committed** -- left in the working tree per Jay's standing "own call on when to commit."

## 2026-08-20 (cont. 14) -- AuthSheet.tsx, AuthPanel.tsx: login/create account bottom sheet restyle

Ask (5 items, Jay verbatim):
1. "login create account bottom sheet - Update the login and create account text fields to have black outline *like the search bar)"
2. "login create account bottom sheet - Update the titles above text fields to be sentence case."
3. "login create account bottom sheet - remove the border lines above and below the tabs component."
4. "login create account bottom sheet - update sentence below tabs on Create account to say \"Create an account to save lists and spot more dodgy deals\""
5. "Update the sentence below tabs on Login:\nLogin to Dodgy deals your email and password"

Fix:
1. AuthPanel.tsx `inputClass`: swapped `focus:ring-2 focus:ring-ink-200` for SearchBar.tsx's own pill treatment -- `border-stone-300` at rest, `shadow-sm`, `focus:border-stone-900` (solid black-ish border, no ring). `errorInputClass` (derived via `.replace()`) updated to swap the new focus token for `focus:border-alert-600` instead of the old ring token, so an in-error field still turns red not black on focus.
2. AuthPanel.tsx `labelClass`: dropped `uppercase` (was CSS-forcing all-caps regardless of the JSX string's own case, so the string case alone did nothing visible). Fixed the two labels that were relying on that: "NZ ZIP Code" -> "NZ zip code", "Email Address" -> "Email address". "Name"/"Select age"/"Password"/"Confirm Password" -> "Confirm password" already sentence case underneath. `font-black`/`text-[11px]`/`tracking-widest` left as-is (narrower change than a full label restyle -- ask was specifically about case).
3. AuthSheet.tsx: removed `border-b border-stone-200` from the header row (line ~139, "above the tabs") and from the tab-track wrapper (line ~240, "below the tabs"). Left the tab-pill's own `rounded-xl border border-stone-200` alone -- that's the segmented control's own outline, not a horizontal divider.
4/5. AuthPanel.tsx: the old `{prompt && <p>{prompt}</p>}` sentence (driven by whatever each calling page passed to `openAuthSheet(prompt)`) replaced with a fixed pair of strings keyed off `mode`, reproduced verbatim from Jay's own asks. `prompt` prop left in place on both this component's type and AuthSheet's pass-through (every call site untouched) in case page-specific context comes back in some other slot later -- it's just not read into a local binding or rendered anywhere now.

Flagged (not silently fixed): Jay's Login sentence, implemented character-for-character as given, reads as missing "with" ("...deals with your email...") and uses "Dodgy deals" where this app's own established brand capitalization elsewhere is "Dodgy Deal" (e.g. AppHeader.tsx's "How Dodgy Deal works"). Also flagged: replacing the per-page `prompt` text with a fixed per-mode sentence means the previously-shown page-specific context (e.g. lists/page.tsx's "Log in to create and save shopping lists.", AddToListButton.tsx's "Log in to save items to a list.") no longer displays anywhere in this sheet -- this was the more consistent reading of "update the sentence below tabs" (the old text didn't change per tab, so it could show stale/mismatched copy after a tab switch), but it is a real behavior change beyond a pure wording edit, surfaced here in case Jay wants that context back in a different spot.

Verified: `tsc --noEmit` clean on both apps/mobile and packages/shared. `eslint` clean on both touched files. Dev-server log tailed post-commit -- two clean `✓ Compiled` entries for the edits, no new errors (only pre-existing, unrelated LCP-image warnings from earlier in the log).

Files touched: apps/mobile/src/components/AuthSheet.tsx, apps/mobile/src/components/AuthPanel.tsx

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-20 (cont. 15) -- AuthPanel.tsx: Login subtitle wording fix

Ask (Jay verbatim): "Login to Dodgy deals your email and password - should be: \"Login to Dodgy deals with your email and password\""

Fix: `subtitle`'s sign-in string (added cont. 14) changed from "Login to Dodgy deals your email and password" to "Login to Dodgy deals with your email and password" -- the missing "with" flagged in cont. 14's entry. Doc comment in AuthPanel.tsx updated to record the correction inline rather than rewritten as if it were right the first time.

Flagged, still not silently fixed: "Dodgy deals" (lowercase "deals") still doesn't match this app's own established brand capitalization "Dodgy Deal" (e.g. AppHeader.tsx's "How Dodgy Deal works"). Left exactly as Jay typed it both times -- raising again in case it's also worth a follow-up ask.

Verified: `tsc --noEmit` clean on apps/mobile. `eslint` clean on AuthPanel.tsx. Dev-server log tailed post-commit -- clean `✓ Compiled` entry, no new errors.

Files touched: apps/mobile/src/components/AuthPanel.tsx

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-20 (cont. 16) -- Price History Insights carousel: UX ideas, then a real duration-weighting bug caught and fixed in the "On Special" frequency stat

**Ask (Jay):** wanted UX ideas for the OTHER carousel slides beyond the existing store-compare chart and 90-day low/high/avg/frequency cards -- "what else, could another slide show the price change graph over 90 days?" Talked through options in chat first (not all built this session): a real 90-day price line graph (confirmed feasible -- `price_history` has raw per-scrape rows, indexed by product+store+time, just not exposed as a client series today), merging the 4 single-stat cards into one 2x2 grid slide (cuts swipe count), a "where does this price rank" gauge against the existing low/high, a special-cadence/"next expected drop" stat, a $/unit trend slide (shrinkflation-specific), and a data-confidence badge. Jay picked "merge the cards" (2x2 grid, not yet built) and, separately, a rewrite of the "On Special" card's copy from raw "X% of checks" to a plain-English tier ("Frequently/Occasionally/Rarely/Never Discounted") + human day-count detail.

**Peer-review catch before writing the tier-label code:** `scraper.js`'s own header states price_history is CHANGES-ONLY storage ("We only write a row to price_history if the price changed") -- a row marks a price/special-state TRANSITION, not a daily check. `history_90d`'s 2026-08-19 version computed `price_history_90d_special_samples / price_history_90d_samples` (a COUNT-based ratio over transition rows) and the UI planned to headline that as a confident-sounding tier label. Concrete failure case worked through with Jay: a product that went on special 5 days ago with no price change since has exactly ONE row in the 90-day window (the transition) -- old logic: 1 of 1 samples special = "100%", would have shown "Frequently Discounted" for a product genuinely discounted only 5 of the last 90 days. Same flaw silently affected `price_history_90d_avg` too (unweighted `AVG(price)` over transition rows lets a price that changed often outweigh one held steady for months). Jay's call, given the choice between shipping tier labels on the flawed metric ("C-quick") vs fixing the underlying SQL first ("C-correct"): **C-correct**.

**Fix -- SQL (dodgy_deals_view.sql / migrations/20260820_dodgy_deals_time_weighted_history.sql):** Rewrote `history_90d`'s CROSS JOIN LATERAL to be duration-weighted instead of row-counted. Each `price_history` row is now treated as the START of a span lasting until the next row's `scraped_at` (or `now()`, for the most recent row) -- a `spans` CTE inside the LATERAL -- then every span is clipped to the 90-day window in a `clipped` CTE, deliberately keeping the "carry-in" row (`scraped_at` before the window but the span extends into it) so a product's state going INTO the window counts from day 1, not from whenever it next happened to change. Aggregates now sum clipped SECONDS (`EXTRACT(EPOCH FROM (clip_end - clip_start))`), not row counts. Result: `price_history_90d_avg` corrected in place (now duration-weighted, same column name/shape); two new columns, `price_history_90d_days_tracked` (total days actually covered by history in the window -- may be < 90 for a newer product) and `price_history_90d_special_days` (days actually spent on special). `price_history_90d_samples`/`_special_samples` deliberately left unchanged in meaning (still transition-row counts) -- kept as the `MIN_90D_SAMPLES_FOR_INSIGHTS` confidence gate for Low/High ("how many distinct prices have we actually observed"), a different, weighting-independent question. `security_invoker` re-applied via the trailing `ALTER VIEW`, same standing requirement as every prior fix to this view; migration ends with the same explicit `REFRESH MATERIALIZED VIEW CONCURRENTLY public.dodgy_deals_cache` pattern as 2026-08-19's.

**Fix -- client (packages/shared):** `deal-detail.ts`'s `buildPriceHistoryInsights()` now reads `ninetyDayDaysTracked`/`ninetyDaySpecialDays` (not the `_samples` pair) for the frequency card, and its gate was extended to require both non-null alongside the existing low/high/avg/samples checks -- so until the migration is live AND `data.ts`'s `select=` picks up the two new columns, the function safely returns `[]` (skips the whole insights carousel) rather than computing a frequency card from `undefined ?? null` fields. New `frequencyTierLabel()` maps duration-weighted `specialDayPct` to Never (0 days) / Rarely (<15%) / Occasionally (15-39%) / Frequently (>=40%) Discounted -- headline is now the tier, not the raw %, with `detail` reading "`{specialDays} of the last {daysTracked} days tracked`" (real tracked-days denominator, not a hardcoded "90", since a newer product's `days_tracked` can be < 90). `data.ts`: added `price_history_90d_days_tracked`/`price_history_90d_special_days` to `DodgyDealsRow`, `ninetyDayDaysTracked`/`ninetyDaySpecialDays` to `CurrentDeal`, wired the `?? null` mapping in `fetchTodaysSpecials`'s row-mapping loop, and added both fields (null) to every other `CurrentDeal` literal in the codebase so `tsc` catches every call site (`fetchNonSpecialProductCards` in data.ts itself, `lists.ts`'s list-item-card builder, `apps/mobile/src/app/history/page.tsx`'s snapshot-card builder -- found the last two via a repo-wide grep for `ninetyDaySpecialSamples`, not just the file this session started in, after `tsc` caught the first miss in `lists.ts`).

**Deliberately NOT done this session -- deploy-order guard, same lesson as 2026-08-19's incident:** `data.ts`'s `select=` string does NOT yet include `price_history_90d_days_tracked`/`price_history_90d_special_days` -- both the SQL migration and the client change were written in the same pass, but 2026-08-19's own history (documented earlier in this file and in dodgy_deals_view.sql's header) is a live PostgREST 400 on every page, caused by shipping new column names in this exact `select=` string before their migration reached the live database. `migrations/20260820_dodgy_deals_time_weighted_history.sql` is explicitly marked "NOT applied to the live database this session." Loud comments left at both the migration's own header and the `select=` site in `data.ts` spelling out the exact deploy order and the `information_schema.columns` check to confirm before adding those two names to the query string. Until that happens, `buildPriceHistoryInsights`'s new gate (above) means the carousel simply shows no insights slides -- not broken ones.

**Also NOT done -- flagged, not decided silently:** the 2x2-grid slide merge (the other half of "C") and the 90-day price-line-graph slide (Jay's original idea) were discussed and scoped as feasible but not built this session -- only the frequency-card copy/data-correctness fix was in scope for "let's go with C" once the duration-weighting bug surfaced.

**Verified:** `npx tsc --noEmit -p packages/shared/tsconfig.json` and `-p apps/mobile/tsconfig.json` both clean. `node --test --experimental-strip-types` on `packages/shared` -- 8/8 new/updated `deal-detail.test.ts` tests passing (including a named regression test reproducing the "5 days ago, one transition row" failure case above, and a tier-boundary test at 14/15% and 39/40%), 63/63 total in the package. `npx eslint` on the touched `apps/mobile` file (`history/page.tsx`) -- one pre-existing, unrelated `react-hooks/set-state-in-effect` error at line 120 (nowhere near this session's edit at line ~311-318), same category of pre-existing issue already logged against other files in this project's own history; no new lint errors introduced. SQL itself NOT verified against a live Postgres instance this session -- no direct DB access available (same standing limitation as the 2026-08-12 session noted in this file's own history) -- parenthesis-balance-checked and manually re-read for the LATERAL/CTE/window-function/FILTER shape, but Jay should run a live spot-check (e.g. pick one product/store, compare `price_history_90d_days_tracked`/`price_history_90d_special_days` against a manual read of its `price_history` rows) before trusting it in production, same standing ask as every prior migration this session couldn't directly verify live.

**Files touched:** `dodgy_deals_view.sql`, `migrations/20260820_dodgy_deals_time_weighted_history.sql` (new), `packages/shared/src/deal-detail.ts`, `packages/shared/src/deal-detail.test.ts`, `packages/shared/src/data.ts`, `packages/shared/src/lists.ts`, `apps/mobile/src/app/history/page.tsx`.

**Not committed** -- left in the working tree per Jay's standing "own call on when to commit." Migration not applied live -- see deploy-order note above.

## 2026-08-20 (cont. 16) -- EmptyState.tsx (new), page.tsx, specials/page.tsx: white-card empty states

Ask (Jay verbatim, re: the "No confirmed real-saver deals started in the last week." placeholder shown when selecting supermarket pills): "Can we use the white card background around all empty state messages for consistency? And centre the text within the card."

Fix: Added a new shared `EmptyState.tsx` component (`components/EmptyState.tsx`) -- the same `rounded-3xl border border-dashed border-stone-200 bg-white ... text-center` dashed-white-card look already used inline in `page.tsx`'s signed-out MyListSection, `history/page.tsx` (x2), and `lists/page.tsx`, and the same "why a shared component" reasoning `ErrorState.tsx` already established for the load-failure sibling. Takes `children` (not a string prop) so a caller with a Link inline (below) doesn't need a second API. No `mx-5` baked in -- callers whose parent already applies `px-5` get a plain, unmargined card; callers whose parent has no padding of its own pass `className="mx-5"`.

Applied to the 3 plain, un-carded `<p>` empty-state messages found in the app:
- `page.tsx` TrendingSection: "No confirmed real-saver deals started in the last week." (Jay's own example, surfaced by the Home store filter pills)
- `page.tsx` MyListSection: "Nothing in your lists is currently on special — check My Lists." (kept its inline `<Link>`)
- `specials/page.tsx`: "No specials found (for this store) right now." (surfaced by that page's own store filter pills)

Deliberately NOT touched, flagged rather than silently included:
- The 3 pre-existing inline dashed-card usages (`page.tsx` MyListSection signed-out state, `history/page.tsx` x2, `lists/page.tsx`) -- already match this exact look, left as their own inline markup rather than a drive-by rewrite: this pass was scoped to giving the un-carded messages the same treatment.
- `StoreCompareChart.tsx`'s "No store data to compare yet." -- a fixed-height (`h-56 w-full`) placeholder sized to match the real bar chart it stands in for, using that chart's own `bg-stone-50`/`border-stone-100` container rather than the page-level white-card language; swapping it would change that widget's own height/fill, not just its text.
- `AddToListButton.tsx`'s "Create a list first" link -- a CTA inside an already-chromed bottom sheet, not a standalone empty-state message.

Verified: `tsc --noEmit` clean on apps/mobile. `eslint` clean on all 3 touched/added files. Dev-server log tailed post-commit -- clean `✓ Compiled` entries for all 3, no new errors.

Files touched: apps/mobile/src/components/EmptyState.tsx (new), apps/mobile/src/app/page.tsx, apps/mobile/src/app/specials/page.tsx

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-20 (cont. 17) -- AppHeader.tsx, page.tsx: profile icon + My List sheet trigger

Ask (Jay verbatim):
1. "Top nav bar - Use a filled in (black) user profile icon and make the icon larger, the size of the whole circle container."
2. "Home page - The my list tab's (not logged in) login create account button links to my list - it should just trigger the login/account bottom sheet"

Fix:
1. AppHeader.tsx signed-out profile button: swapped lucide's outline `CircleUser` for `User` (plain person silhouette, no circle frame of its own) rendered with `fill="currentColor" stroke="none"` -- lucide ships one outline style per icon, no separate filled variant, so this is the standard way to fake a solid glyph from it. `CircleUser` was tried first and rejected: its outer ring is a separate `<circle>` from the inner head, so filling it solid just paints one flat disc with no visible face. Icon bumped `h-5 w-5` -> `h-8 w-8` (was floating with visible padding inside the `h-8 w-8` button; now fills it edge-to-edge), button given `overflow-hidden` so the icon's now-equal-size square bounding box clips cleanly to the circle. Scoped to the signed-out state only -- the signed-in state shows the user's own initial letter in a colored circle, a different, unrelated pattern Jay's ask didn't touch.
2. page.tsx MyListSection signed-out CTA: was `<Link href="/lists">`, navigated away from Home to Lists (which just showed the SAME prompt again via its own openAuthSheet). Now a `<button onClick={() => openAuthSheet("Log in to see specials in your lists.")}>`, same `useAuth()` source every other "Log in" entry point in this app already uses.

Verified: `tsc --noEmit` clean. `eslint` clean on both files. Dev-server log clean post-commit.

Files touched: apps/mobile/src/components/AppHeader.tsx, apps/mobile/src/app/page.tsx

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-20 (cont. 18) -- 6-item batch: nav bar color, search bar styling x4, store pill fill animation, search default tab

Ask (Jay verbatim, sent mid-turn while cont. 17 was in progress):
1. "Make the top nav bar on all pages, a slightly lighter grey than the background of the app."
2. "Check deals page - remove the stroke border from the normal state search bar."
3. "Use the same fill animation (used in tabs) when selecting supermarket pills - respect each pills different colour values"
4. "In the active search bar state, replace the search icon with the dodgy man icon."
5. "All checks and Deal stats pages - remove the search bar's white background (container fill) to match the Check deals page."
6. "Full screen search mode should always default to 'All Specials' not dodgy, and be the same for any entry point to search."

Fix:
1. AppHeader.tsx `<header>`: `bg-stone-50` -> `bg-white`. Header was rendering the exact same token as the page background (`globals.css`'s own `--background: #fafaf9`, this app's own stone-50) -- zero separation. No lighter-than-stone-50 token exists anywhere in this project's palette (only custom `ink-*`/`fair-*`/`dodgy-*`/`alert-*` scales + a couple one-offs; every `stone-*` used app-wide is Tailwind's own unmodified default, and stone-100 is *darker* than stone-50, not lighter) -- plain `bg-white` is the only "lighter" option without inventing a new token, and reads as "slightly lighter" since it's only barely above stone-50 on the lightness scale.
2. page.tsx Home's `<SearchBar blurred />` -> `<SearchBar blurred variant="shadow" />`. `SearchBar.tsx`'s two variants differ in exactly the pill's own at-rest border (`border-stone-300` vs `border-transparent`; both still gain `focus-within:border-stone-900` either way). `blurred` already overrides the wrapper background regardless of variant, so this only drops the grey stroke at rest, reusing the existing "shadow" variant rather than adding a 3rd variant/prop just for the border.
3. StorePill.tsx: converted to the same `AnimatePresence` + absolutely-positioned `motion.span` pop-in fill already used by every tab track in this app (`AuthSheet.tsx`, `BottomNav.tsx`, `app/page.tsx`, `FullScreenSearch.tsx`'s own Dodgy/All-specials tabs), including the `relative z-0` stacking-context fix those all needed. The one real difference: those are all a fixed `bg-stone-900` fill regardless of tab; this pill's fill color is per-store (`meta.bg` -- `getStoreLogoMeta`'s own emerald/amber/rose/green per supermarket, or `bg-stone-900` for "all"), moved off the button's static className onto the animated fill span itself. Single shared component, so both usages (Home's own pills, FullScreenSearch's store pills) picked this up from one edit.
4. FullScreenSearch.tsx active-input row: lucide's `Search` icon (its only usage in this file, dropped from the import) replaced with the `/logo.svg` mascot mark at the same `h-5 w-5`/`mr-3` footprint, same pattern `AppHeader.tsx`/`AuthSheet.tsx` already use for their own brand mark.
5. history/page.tsx and me/page.tsx: all 6 `<SearchBar />` call sites (3 each) -> `<SearchBar blurred />`. Was default variant + not blurred -> opaque `bg-white` sticky wrapper; `blurred` swaps that for the same transparent + `backdrop-blur-md` treatment Home already uses. Scoped to just the wrapper fill -- these two pages' pills keep their own `border-stone-300` at rest (unlike Home's, item 2 above), since Jay's two asks were separate concerns.
6. FullScreenSearch.tsx: `popularTab`/`popularSortBy` defaults changed "dodgy"/"recent" -> "specials"/"discount" (the pre-3-character "Popular" browse tab -- `priceFilter`, the post-typing results tab, already defaulted to "specials" from an earlier same-day session). `handleBack` now also resets `popularTab`/`popularSortBy` alongside `priceFilter` -- this component stays mounted between opens (doesn't unmount on close), so without this a manual tab switch from a previous visit would still be showing on the next one, which is exactly the "same for any entry point" consistency this ask is about.

Flagged, not fixed (out of scope for this batch, pre-existing, unrelated to any line touched today): `eslint` surfaced 3 pre-existing `react-hooks/set-state-in-effect` errors while verifying this batch -- `history/page.tsx:120` (`setFallbackProducts` inside a `missingIds` effect), `me/page.tsx:68` (`setLoading` inside the deal-check-history fetch effect), `FullScreenSearch.tsx:413` (`setIsSearchResultsExpanded` inside a filter-change effect). None of these effects were touched by today's edits (confirmed by diffing today's actual changes against each) -- surfacing here since they're real lint errors sitting in the codebase, not something to silently leave unmentioned, but fixing them wasn't asked for and each would need its own considered fix (same "state that depends on X changing -> compute during render, not in an effect" pattern this codebase already uses elsewhere, e.g. `AuthPanel.tsx`'s `lastMode`), not a drive-by inside this batch.

Verified: `tsc --noEmit` clean on apps/mobile. `eslint` clean on all 6 touched files EXCEPT the 3 pre-existing errors above (unrelated to today's changes, see Flagged). Dev-server log tailed post-commit -- clean `✓ Compiled` entries, no new runtime errors.

Files touched: apps/mobile/src/components/AppHeader.tsx, apps/mobile/src/app/page.tsx, apps/mobile/src/components/StorePill.tsx, apps/mobile/src/app/history/page.tsx, apps/mobile/src/app/me/page.tsx, apps/mobile/src/components/FullScreenSearch.tsx

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-20 (cont. 19) -- AppHeader.tsx: top nav bar drop shadow

Ask (Jay verbatim): "give the header top nav a tight drop shadow like the other components have"

Fix: `<header>` gained `shadow-sm` -- the same "tight drop shadow" utility SearchBar.tsx/DealCard.tsx/ProductListCard.tsx already use app-wide (SearchBar.tsx's own 2026-08-17 doc comment names this precedent explicitly), not a new shadow value invented for this bar. Applied to `<header>` itself, not the outer sticky wrapper that also holds the anonymous-test-mode banner -- the banner sits above the bar, not under it, so the shadow belongs on the white bar's own bottom edge (the same edge that picked up real separation from the page in cont. 18's `bg-stone-50` -> `bg-white` change).

Verified: `tsc --noEmit` clean on AppHeader.tsx (one unrelated pre-existing error in a stray `_to_delete_stage_deal_page.tsx` leftover file, untouched, out of scope). `eslint` clean. Dev-server log tailed post-commit -- clean compiles, no new errors.

Files touched: apps/mobile/src/components/AppHeader.tsx

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 -- Deal page: Price History Insights bar graph, legend, hero price color, 4th tile simplify

Ask (Jay verbatim):
1. "Deal assessment page - Price History Insights - the bar graph should show the larger area as black, and the smaller area as the green or red, to match the percentage less or more."
2. "Centre the legend 'Recent average, Cheaper, Pricier' above the graph."
3. "The item price text at the top should also be Green if cheaper, Red if pricier, or Black if no change."
4. "4th tile is a bit packed with info: On special / Frequently Discounted / 47 of the last 90 days tracked. Could we simplify it to: Frequently on special / 47 times in the last 90 days."
5. "text-[10px] font-black tracking-wide text-stone-500 - needs to be larger try 14px."

Fix:
1. StoreCompareChart.tsx: the cheaper-case bar math had `under` (colored) = the FULL currentPrice and `body` (black) = just the delta -- backwards, color was the majority of the bar. Pricier case was already right (`body` = full averagePrice, `over` = just the delta). Swapped the cheaper branch so `body` (black) is always the smaller of current/average -- the shared/common portion -- and the colored segment is always just the delta, matching the pricier case's own logic. Total bar height unchanged (`Math.max(currentPrice, averagePrice)` either way).
2. Deal page's chart legend row: `justify-end` -> `justify-center`.
3. Deal page: new `dealAveragePrice`/`dealPriceColorClass` (via `getRealAveragePrice(product, dealStore)` -- THIS deal's own store, not `cheapestAveragePrice`'s cheapest-store comparison used elsewhere on the page) applied to the hero `${deal.price...}` span -- `text-fair-700` (green) if cheaper, `text-alert-700` (red) if pricier, `text-stone-900` (black) if equal or no real average to compare against. Same color tokens the chart's own legend already uses for "Cheaper"/"Pricier".
4. deal-detail.ts `buildPriceHistoryInsights`: frequency tile's `label` changed "On special" -> "" (folded into the tier phrase itself), `frequencyTierLabel` tier strings changed "X Discounted" -> "X on special" (e.g. "Frequently on special"), `detail` reworded "X of the last Y days tracked" -> "X times in the last Y days" (Y still the real `ninetyDayDaysTracked`, not a hardcoded 90). `PriceHistoryInsightCard.tsx`'s label line now conditionally rendered (`insight.label && (...)`, matching the existing `detail` guard) since this one tile's label is now legitimately empty -- collapses that tile from 3 lines to 2, matching every other tile's own line count, so all 4 now vertically center the same way.
5. PriceHistoryInsightCard.tsx: the shared tile-label class `text-[10px] font-black tracking-wide text-stone-500` -> `text-sm font-black tracking-wide text-stone-500` (`text-sm` = 14px at this app's root size, the design-system token for that value rather than another arbitrary bracket value).

Flagged, not silently "fixed": `ninetyDaySpecialDays` is a duration-weighted DAY count (days spent on special), not a count of discrete discount events -- so "X times" is a slightly loose word for what the number measures. Implemented exactly as Jay typed it anyway, per this codebase's standing convention for quoted copy.

Test updates: `deal-detail.test.ts`'s 4 `buildPriceHistoryInsights` tests asserted the OLD tier/detail/label strings -- updated all 4 to the new copy (plus a new assertion that the frequency tile's `label` is `""`). 63/63 passing after the update (was 59/63 immediately after the source change, before the test update).

Verified: `tsc --noEmit` clean on both apps/mobile and packages/shared (one unrelated pre-existing error in the stray, already-flagged `_to_delete_stage_deal_page.tsx` leftover file). `eslint` clean on all touched files. `node --test` 63/63 passing. Dev-server log tailed post-commit -- clean compiles, no new runtime errors.

Files touched: apps/mobile/src/app/deal/[id]/[store]/page.tsx, apps/mobile/src/components/StoreCompareChart.tsx, apps/mobile/src/components/PriceHistoryInsightCard.tsx, packages/shared/src/deal-detail.ts, packages/shared/src/deal-detail.test.ts

Housekeeping: moved this session's own bracket-path staging workaround copy (`page_stage_20260821.tsx`) into a new `apps/mobile/src/app/deal/_to_delete/` subfolder rather than leaving it loose next to `page.tsx` -- device_bash can't `rm` on a mounted folder, so it's parked there for Jay to delete along with the older `_to_delete_stage_deal_page.tsx` leftover (same folder, from an earlier session) whenever convenient.

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 (cont. 2) -- Silent commit failure on the bracket-path deal page, re-committed

Ask (Jay verbatim): "Recent average / Cheaper / Pricier need to be centred within the container"

Root cause, not a new ask: this is the SAME legend-centering fix from the previous entry -- `justify-end` -> `justify-center` -- which I believed had landed (the `device_commit_files` call reported "written", `tsc`/`eslint`/dev-log all looked clean afterward). It hadn't. Checking just now, the live file on Jay's machine still had `justify-end` AND was still missing the hero-price-color change from that same entry (`dealPriceColorClass` wasn't present at all) -- the commit for this one bracket-path file (`app/deal/[id]/[store]/page.tsx`, staged/committed via the established sibling-copy workaround for this app's one route with literal `[id]`/`[store]` segments) silently no-opped despite reporting success. The other 4 files in that same batch (StoreCompareChart.tsx, deal-detail.ts, PriceHistoryInsightCard.tsx, deal-detail.test.ts -- none of them bracket paths) all landed correctly, confirmed by grep just now. Strongly suggests the bracket-path workaround's commit step itself is where this silently fails, not something wrong with my edits or a race with anything else touching the file.

Fix: re-sent the same (already-correct) local file, re-checked the live file's current mtime fresh (don't trust a stale mtime from earlier in the session), re-committed, and this time verified with an immediate `grep` for both changes on the device copy before moving on -- confirmed present.

Process change going forward: for this one bracket-path route, a "written: true" response from `device_commit_files` is no longer being treated as sufficient proof of a successful write -- every commit to `app/deal/[id]/[store]/page.tsx` specifically will get an immediate post-commit `grep` for something unique to that edit, not just a tsc/eslint pass (which only prove the CURRENT live file compiles, not that it contains the intended change if the write silently no-opped).

Verified: `tsc --noEmit` clean (same one unrelated pre-existing stray-file error as before). `eslint` clean. Dev-server log clean. `grep` on the live device file now shows both `dealPriceColorClass` and `justify-center` present.

Files touched: apps/mobile/src/app/deal/[id]/[store]/page.tsx (re-commit only, no new source changes -- the code was already right, it just hadn't reached the device before)

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 — Cheaper-alternatives carousel redo, Share icon fix, 90-Day Price Tips icons/tints/text-sizes

**Trigger:** the previous turn's "See cheaper options" bottom-sheet -> inline-carousel implementation in
`apps/mobile/src/app/deal/[id]/[store]/page.tsx` was found reverted on disk at the start of this turn — the file
still had the old `currentView` state, no `ChevronDown`, and the old bottom-sheet block, despite having been
successfully committed earlier. Root cause suspected at the time: a stale editor buffer overwriting the commit.
Jay flagged mid-session that this was more likely iCloud Drive evicting/re-syncing the local file copy (the
project folder lives under `~/Documents`, which iCloud can silently offload and re-fetch) — this fits the evidence
better than an editor autosave and is the more likely explanation. Confirmed independently this turn: `node -e
require(...)` against `node_modules/lucide-react` failed with `Unknown system error -35`, a known macOS iCloud
Drive "file not fully downloaded" error code, while the same package's `.d.ts` files (plain text) read fine via
grep. Jay is redownloading the affected files via iCloud; worth avoiding heavy edit sessions on this repo while
iCloud is still settling, and worth checking whether the project folder can be excluded from iCloud sync (or moved
outside `~/Documents`) to stop this recurring.

**Redone in `page.tsx`** (this time verified with `tsc --noEmit` + `eslint` immediately after each commit, and the
commit's `expectedMtimeMs` re-checked via `device_list_dir` right before writing, not just once at the start):
- `showCheaperCarousel` boolean state replaces the old `currentView: "assessment" | "cheaper-alternatives"` union
  — no longer swaps between two whole views, just shows/hides one inline section.
- "See cheaper options" button gets a `ChevronDown` icon (rotates 180° when open, `aria-expanded` wired up) and now
  toggles `showCheaperCarousel` instead of navigating to a separate view.
- The old bottom-sheet overlay (scrim + slide-up panel, `ScannerModal`-style) is gone. In its place: an
  `AnimatePresence`/`motion.div` wrapper animating `height: 0 -> "auto"` (spring, damping 28 / stiffness 260),
  containing the same `InsightCarousel` component the Price History Insights section stopped using on 2026-08-20
  — reused here with zero changes to `InsightCarousel.tsx` itself, exactly the "flagged rather than deleted, in
  case another screen wants it" case that file's own doc comment called out. Cards inside are the same "Similar
  deals" card content the old sheet had (product image, brand/unit with no "·" separator, name, save-vs-original
  badge, "Lowest price: $X", store logo badge, "Go to {store}" link, `AddToListButton` top-right) — ported
  verbatim, not redesigned; only the outer container changed from a stacked list in a sheet to one-per-slide in a
  carousel. Deliberately NOT given a fixed slide height (unlike `InsightCarousel`'s original Price-History use)
  since card height varies with product-name wrapping and the outer `motion.div` already re-measures to "auto" on
  every render.
- Stale comments cleaned up in the same pass: the `usePageHeader` comment that referenced "the sheet itself, near
  the end of this return" (no longer true — no sheet), and the Price-History section's own comment claiming
  `InsightCarousel.tsx` was "no longer used anywhere in this app" (also no longer true, now that this section
  reuses it).

**Share icon**, per Jay's newest ask ("like the add to list icon... circle around the icon and a white fill in the
circle"): the `Share2` button had actually been explicitly flagged as a possible follow-up back on 2026-08-17,
when `AddToListButton` beside it got its own white-fill circle — that follow-up is what this is. Restyled to the
exact same shape as `AddToListButton`'s `buttonClassName`
(`flex h-7 w-7 items-center justify-center rounded-full border border-stone-900 bg-white text-stone-900`), so the
two buttons now sit as a matched pair.

**`PriceHistoryInsightCard.tsx`** — 4 changes, all per Jay's newest ask on the 90-Day Price Tips grid:
1. Detail line ("46 times in the last 90 days" etc.) — `text-[10px]` -> `text-sm` (14px), matching the label
   above it which got the same bump the day before.
2. Frequency tile's headline (`insight.value`, e.g. "Frequent special") — `text-lg` -> `text-base`, scoped to just
   that tile via `insight.key === "frequency"`; the other 3 tiles' `$` values are short fixed-width numbers and
   stay `text-lg`.
3. Each tile now gets its own subtle background tint via a local `TILE_STYLE` lookup keyed by `insight.key`: low =
   `bg-sky-50`, high = `bg-violet-50`, avg = `bg-teal-50`, frequency = `bg-emerald-50` — all cool tones,
   deliberately clear of red/orange/amber since this app's own `dodgy`/`alert` tokens already live in that warm
   range for verdict cards elsewhere on the same page, and a warm tile tint here would misread as a warning.
   Card's own `bg-stone-50` fallback dropped now that every cell paints its own tint.
4. Icon above the text stack per tile, same `TILE_STYLE` lookup: `ArrowDown` (low), `ArrowUp` (high) — the same
   direction metaphor the price-ranking rows on this page already use for cheaper/pricier — `Equal` (avg, the
   "typical middle value"), `Tag` (frequency, a specials-frequency stat). Icon/tint pairing kept local to this
   component rather than added to the shared `PriceHistoryInsight` type (`packages/shared/src/deal-detail.ts`) —
   presentation-only, only this one rendering cares.

**Verified:** `tsc --noEmit` clean, `eslint` clean on both changed files, `packages/shared` test suite 63/63
passing (unaffected by these changes — no shared-package logic touched this turn, only `apps/mobile` UI). All
edits round-tripped through `device_list_dir` (fresh `mtimeMs` immediately before each commit) ->
`device_commit_files` (`expectedMtimeMs` guard) -> re-verified via `tsc`/`eslint` run directly on Jay's own disk
copy after each write, specifically to catch a repeat of the revert incident early if it happened again. It didn't
— confirmed present via grep re-check after each commit.

**Mid-session hiccup:** device bridge briefly disconnected right after the final comment-only cleanup commit to
`page.tsx` landed (the desktop app's version number changed across the gap, `1.32885.1` -> `1.34493.0`, consistent
with a restart — likely the same iCloud activity Jay flagged, not something this session did). Reconnected within
the minute; `tsc --noEmit` + `eslint` re-run on `page.tsx` immediately after reconnect, both clean, and the file's
content re-confirmed unchanged from what was committed (no repeat revert this time).

## 2026-08-21 (same day, follow-up) — Tile color override, price-ranking ties + cross-store links, bigger/centred icons, My List gate copy

**`device_bash` went down mid-turn** (the tool that runs shell commands directly on Jay's machine) — failed 5
consecutive times with "workspace appears wedged," including a bare `echo hello`, so this wasn't a one-off flake.
Switched to the file-staging tools (`device_stage_files`/`device_commit_files`/`device_list_dir`) for every read and
write the rest of this entry, and — since `tsc`/`eslint` couldn't be run directly on Jay's machine either — built a
throwaway TypeScript project in this session's own cloud sandbox (real `@types/react`/`@types/react-dom`, shorthand
ambient-module stubs for `next/*`, `lucide-react`, `motion/react`, `@dodgey-deals/shared`, `@/*`) and ran `tsc
--noEmit` against copies of the 5 edited files there instead. That's weaker than a real project-config typecheck —
the stubs collapse imported types to `any`, so it can't catch a real type mismatch against the actual shared
package — but it DOES catch genuine parse/syntax errors, and it came back with zero of those; every error it did
report was implicit-any noise traceable straight to the stubbing, spread evenly across untouched pre-existing lines
too (proof it's the stub, not new bugs). `packages/shared`'s real 63-test suite could not be re-run this entry
(needs `device_bash`/`node --test`, no substitute available) — flagged, not silently skipped.

**Tile colors overridden again**, same day as the first tint pass, per Jay's own follow-up naming specific colors:
"90 day high tile can be a subtle red, with a red arrow. the 90 day low tile should be green. 90 day average tile
should be blue." This directly supersedes the earlier "stay away from reds" tint pass for the HIGH tile
specifically — Jay naming red by name in his very next message is about as explicit an override as a standing style
note can get. `PriceHistoryInsightCard.tsx`'s `TILE_STYLE` now reads: low = `bg-fair-50`/`text-fair-600` (this app's
own green "good deal" token, already used for the price-ranking "Best" badge), high = `bg-alert-50`/
`text-alert-600` (this app's own contrast-checked red), avg = `bg-blue-50`/`text-blue-600` (no existing brand token
reads as plain blue — `ink-*` is this app's near-black/charcoal scale despite the name, confirmed by reading its hex
values in globals.css, so this is the one tile using a raw Tailwind color rather than a brand token). `frequency`
wasn't named in Jay's 3, left as `emerald` from the first pass rather than guessed into a 4th color.

**Frequency tile detail text** (`deal-detail.ts`): "X times in the last Y days" -> "X times in Y days" (dropped "the
last"), per Jay's exact wording on the 4th tile ("5 times in the last 90 days" -> "5 times in 90 days"). `Y` is
still the real `ninetyDayDaysTracked` value, unchanged.

**Deal-assessment page icons** (`page.tsx` + `AddToListButton.tsx`): Share and Add-to-list circles bumped `h-7 w-7`
-> `h-8 w-8`, icons `h-[18px]`/`h-4` -> `h-5 w-5` (20px) on both, per Jay: "make share and add to list [icons]
slightly larger." Add-to-list's icon size used to be hardcoded inside `AddToListButton.tsx` (`h-4 w-4` on both the
Plus and Check glyphs) — added a new `iconClassName` prop (default `h-4 w-4`, so every OTHER caller of this shared
component is unaffected) so only the deal-assessment page's call site can override it. Share icon also given
`block` (Tailwind, forces the SVG out of inline/text layout), per Jay: "ensure share icon is centred within the
circle container" — the button was already `flex items-center justify-center`, which correctly centers a child's
box, but a bare inline SVG (lucide's default) carries a few px of invisible baseline/descender space the way inline
text does, which reads as the icon sitting slightly off-center even though the numbers say it's centered; `block`
removes that gap. Same `block` fix applied to `AddToListButton`'s own Plus/Check icons while that file was already
open for the `iconClassName` change, on the same reasoning, even though only Share was explicitly reported as
off-center.

**Price-ranking ties + cross-store links** (`page.tsx`), 2 changes to the same block, per Jay: "If best price is the
same across two supermarkets, there should be no best badge, and both prices should be green with a tick. The price
ranking texts should also link the item's deal assessment page at other supermarkets."
- Tie handling: "cheapest" used to mean `idx === 0` (first in the price-ascending list). Now means "matches the
  list's lowest price," compared in integer cents (`Math.round(price * 100)`) rather than raw floats, since two
  independently-computed per-store `$` amounts landing on the same cents isn't guaranteed to survive an exact `===`.
  A new `tiedForBest` count (how many rows share that lowest price) decides the "Best" badge specifically — still
  shown, singular, when exactly one store has the lowest price; hidden on every row once 2+ stores tie, per Jay's
  ask, rather than showing it on all tied rows. The tick + green styling, by contrast, already applied to "is this
  row at the best price" and needed no change — it now naturally applies to every tied row for free since
  `isCheapest` itself is what changed meaning.
- Row links: every row except the one for the store this page is already showing (`dealStore`, from the URL) is now
  a `<Link>` to that store's own `/deal/[id]/[store]` page, whole row as the tap target (not just the store-name
  text) to match this app's own "tappable whole card" convention (`DealCard.tsx`), using the exact same
  `/deal/${encodeURIComponent(id)}/${encodeURIComponent(store)}` shape `DealCard.tsx`'s own `goToDeal` already uses,
  not a new pattern. The current store's own row stays a plain `<div>` — "other supermarkets" read literally, and a
  link to the page already on screen has nothing to navigate to.

**"My List" signed-out gate copy** (`app/page.tsx`, `MyListSection`), per Jay's ask on this exact prompt: button
label "Log in or create an account" -> "Log in or create account" (dropped "an") — scoped to just this one button;
the near-identical prompt paragraph above it and the matching buttons on `/lists` and `/history` (still "...an
account") weren't named in this ask and are left as they were, flagged rather than silently made consistent
everywhere on sight. Copy paragraph ("You need to create an account or log in to use My List") widened: `max-w-xs`
(320px cap) dropped, `px-4` -> `px-5` (20px), per Jay: "Increase the width of the copy text box, maybe we can fit
it all on one line (allow 20px padding left and right)."

**Verified:** see the `device_bash` outage note above for how (throwaway sandbox `tsc` project, real `@types/react`,
shorthand stubs for untyped packages) and its limits (no real semantic check against `@dodgey-deals/shared`'s
actual types, `packages/shared` test suite not re-run). Zero parse/syntax errors across all 5 edited files. Every
edit re-staged from Jay's disk and diffed against the intended change immediately before commit, and re-staged again
afterward to confirm the write landed — `app/page.tsx` came back with an unrelated size difference on that final
check (Jay's own separate border -> `shadow-sm` styling pass elsewhere in the same file, confirmed by diff to not
touch anything this entry changed) — noted rather than silently reverted, per this session's own "don't undo a
change that looks deliberate" instinct.

**Follow-up, same entry:** once `device_bash` came back, the real `packages/shared` test suite (not run during the
outage above) caught 3 real failures -- `deal-detail.test.ts` still asserted the OLD frequency-detail wording ("X
times in the last Y days"), which the throwaway sandbox typecheck had no way to catch (runtime string assertions,
not a type error). Fixed by updating the 3 expected strings ("24/0/5 times in the last 90 days" -> "24/0/5 times in
90 days") to match the actual copy change. Suite is back to 63/63. Lesson: the sandbox `tsc` workaround during a
`device_bash` outage covers syntax/type-shaped mistakes only -- it is NOT a substitute for the real test suite, and
any copy/string change made during an outage needs its fixtures re-checked for real once `device_bash` is back,
not assumed fine just because the syntax check passed.

## 2026-08-21 (same day, follow-up) — Frequency tile: swap caption/headline order, match "90-day average" styling

Per Jay, on the 90-Day Price Tips grid's frequency tile: "Rare special / 5 times in 90 days — swap these texts
around, so Rare special is at the bottom. Make the '5 times in 90 days' text, the same as the '90-day average'
text (same font and bold)." `PriceHistoryInsightCard.tsx`: `insight.detail` ("5 times in 90 days") now renders in
the same slot/style the other 3 tiles' own `insight.label` uses (`text-sm font-black tracking-wide text-stone-500`
— literally "90-day average"'s own class string, not a lookalike), ABOVE `insight.value` ("Rare special", which
keeps its existing headline styling) -- frequency's own `label` stays `""`/hidden, unchanged. This makes the
frequency tile's shape (caption on top, headline below) consistent with the other 3 for the first time; the old
standalone bottom detail paragraph (with its `line-clamp-2`/`max-w-[140px]` overflow guard) is gone now that
`detail` moved into the caption slot -- not carried over, since Jay's ask was for literal parity with the caption
line, which has never needed either. Verified: real `tsc --noEmit` + `eslint` on the changed file, both clean; no
`packages/shared` change this entry, so its test suite wasn't re-run (nothing there could regress from this).

## 2026-08-21 (same day, follow-up) — My List search bar no longer sticky

Per Jay: "The search bar on My Lists page does not need to be sticky." `SearchBar.tsx`'s `sticky top-0 z-20` used
to be unconditional (every page using this shared component -- Home, `/lists`, `/history`, `/me` -- docked it under
`AppHeader` on scroll). Added a new `sticky` prop, default `true` (Home/`/history`/`/me` unchanged), and `/lists`
now passes `sticky={false}` at all 3 of its own `<SearchBar>` call sites (loading/signed-out/real-content branches)
so the bar just scrolls away with the rest of that page's content instead of docking. Same per-page scoping pattern
this component's own `blurred`/`variant`/`placeholder` props already established.

Verified: real `tsc --noEmit` (whole `apps/mobile` project, not just the changed files) + `eslint` on both changed
files, both clean.

Side note, not part of this change: while re-staging files this entry, `InsightCarousel.tsx` and
`PriceHistoryInsightCard.tsx` had both drifted further since this session's own last commit to them --
`InsightCarousel.tsx` picked up a real new `slideWidthClassName` prop / "peek carousel" behavior + `getSlideStep`
measurement (its own doc comment dates it 2026-08-21, "per Jay's 'always the same height' ask", referencing a
`h-64` fixed-height version of the cheaper-alternatives cards on the deal-assessment page). Not this session's
own edit -- confirmed harmless rather than reverted: the just-run whole-project `tsc --noEmit` above passed clean
against it, so `page.tsx`'s own use of `InsightCarousel` is consistent with whatever added this. Left untouched,
per this session's own "don't undo a change that looks deliberate" instinct.

## 2026-08-21 (cont. 3) -- "See cheaper options" carousel width/edge-gap, and missing description text

Ask (Jay verbatim):
1. "The deal assessment page - See cheaper options carousel - make the cards a bit wider, and ensure the hint extends to the border of the container, so there's no gap (currently there is a gap)"
2. "Some product items don't have the descriptive text on the deal assessment pages. Price History Insights / How this price compares to each store's recent average, and to its own last 90 days. The body text is missing, it should be on all product items right?"

Fix:
1. Root cause of the gap: the carousel sits inside the verdict card's own `p-5` (20px all sides), which inset the carousel's scroll viewport 20px in from the card's TRUE edges on both sides -- the "peek" of the next/previous card could never reach the card's actual border, no matter how wide the slides were, because of that fixed 20px strip. `InsightCarousel.tsx` gained a new optional `trackPaddingClassName` prop (padding applied to the scroll TRACK itself, not a wrapping div, so it scrolls WITH the content -- the padding only shows at the very start/end of the whole scrollable range, not as a permanent mid-scroll gap). Deal page: wrapped the carousel in `-mx-5` (cancels the card's `p-5` so the viewport spans the card's full width) and passed `trackPaddingClassName="px-5"` (puts the same 20px back, but as scrollable content so a peek can still reach the true edge) plus `slideWidthClassName="w-[88%]"` -> `"w-[92%]"` for "a bit wider."
2. The "How this price compares..." paragraph was gated on `insights.length > 0` -- the same condition gating the 90-day insights GRID further down. But this sentence describes two separate things: the store-compare chart (always rendered) and the 90-day grid (genuinely conditional on real history existing). Gating the whole sentence on the second thing meant any product below the 90-day sample floor showed the chart with zero explanation above it. Un-gated -- the paragraph now always renders.

Verified: `tsc --noEmit` clean (same one pre-existing unrelated stray-file error). `eslint` clean on both touched files. Dev-server log clean post-commit.

Files touched: apps/mobile/src/app/deal/[id]/[store]/page.tsx, apps/mobile/src/components/InsightCarousel.tsx

Process note: learned last entry that a "written" response from `device_commit_files` isn't proof of a successful write on this one bracket-path file -- both commits in this entry were followed by an immediate `grep` on the live device file confirming the new code was actually there before moving on, not just a clean tsc/eslint pass.

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 (cont. 4) -- Multi-select supermarket pills on Home ("Check deals") + search

**Ask (Jay verbatim):** "When selecting supermarket pills on the check deals and search page - allow the user to select multiple pills, not just one at a time - to filter results."

**Scope check:** "Check deals" isn't a page name anywhere in the file tree -- resolved via `BottomNav.tsx`, whose Home tab (`href: "/"`) is literally labeled `"Check deals"` (relabeled from a previous session, 2026-08-11). So this is Home (`apps/mobile/src/app/page.tsx`), not `/specials` (first guess, ruled out -- that page's own `FilterPill`/`storeFilter: string` is a visually distinct, deliberately single-select control Jay didn't ask about here).

**Found:** `FullScreenSearch.tsx` (the "search page") already had full multi-select support -- `selectedStores: string[]`, a `handleStoreToggle` toggle function, and `StorePill` wired with `active={selectedStores.includes(store.id)}` at both its own pill-row call sites. Added 2026-08-10, before this ask. So only Home needed converting -- not a two-page change.

**Fix:** Home's `storeFilter: string` state replaced with `selectedStores: string[]` (default `["all"]`) + the same `handleStoreToggle` shape `FullScreenSearch.tsx` already used (tapping "all" resets to `["all"]`; tapping a store while "all" is active replaces it; tapping while other stores are active toggles it in/out; array can never go empty, falls back to `["all"]`). `trendingDeals`/`myListDeals` memos switched from `storeMatchesFilter(store, storeFilter)` to a multi-select match. `StorePill.tsx` itself needed NO changes -- confirmed already purely presentational (`active`/`onClick` props only), already proven working for both single- and multi-select callers.

**De-duplication:** rather than write a second copy of `FullScreenSearch.tsx`'s local `matchesAnySelectedStore` helper for Home (this codebase's own established "kept in sync" convention flags exactly this as the next drift risk -- see e.g. `SearchBar.tsx`'s `blurred`/`variant` doc comment), promoted the one existing implementation into `packages/shared/src/data.ts` next to `storeMatchesFilter`, and pointed both call sites at it. `FullScreenSearch.tsx`'s local copy removed, its shared import list extended instead. New test added to `data.test.ts` alongside the existing `storeMatchesFilter` tests.

**Files touched:** `packages/shared/src/data.ts`, `packages/shared/src/data.test.ts`, `apps/mobile/src/components/FullScreenSearch.tsx`, `apps/mobile/src/app/page.tsx`.

**Verification status -- NOT fully clean, flagged rather than glossed over:** real `tsc --noEmit -p apps/mobile/tsconfig.json` and `eslint` both hit the same iCloud file-read corruption documented below (cont. 5) -- `Resource deadlock avoided` / `Unknown system error -35` reading files this change never touched (`node_modules/@types/node`, ESLint's own `debug` dependency). The real `packages/shared` test suite ran 39/41 (`catalogue-cache.test.ts` and `data.test.ts` both failed to LOAD as whole files, same `-35` read error, `failureType: 'testCodeFailure'` -- not an assertion failure). Strong evidence this is 100% environmental, not a real regression in the new `matchesAnySelectedStore` test: `catalogue-cache.test.ts` is a file untouched anywhere this session, and it failed identically. Re-run once the iCloud issue (cont. 5) is resolved and confirm `data.test.ts` passes clean before treating this as fully verified.

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 (cont. 5) -- "Show all X deals" -> infinite-scroll reveal (Home trending, search popular/results, /specials); egress/caching discussion

**Ask (Jay verbatim):** "On the trending results, dodgy results & full screen search results - results are limited, then there is a 'Show all X deals' (usually the full amount). Should we say 'Show next 100 items' or a smarter amount? rather than show all deals. What is the smartest approach when fetching from our DB, or do we have smart caching already to stop egress bloat on the db? Discuss your plan."

**Discussion, before any code:** Traced the full data path (`data.ts`, `catalogue-cache.ts`) -- `loadLiveProducts()` fetches the entire current-specials catalogue once per session-hour (`dodgy_deals_cache` materialized view, 15-min `pg_cron` refresh -> 1-hour cross-session IndexedDB cache -> 30s in-memory promise dedupe). Every "trending"/"dodgy"/"search results" list is a `useMemo` filter/sort over that ONE already-in-memory array. Confirmed by reading the code, not assumed: clicking "Show all N deals" fires ZERO Supabase calls -- it just flips a `.slice(0, N)` to the full array. So egress was already solved before this ask; no caching layer needed changing.

The REAL risk, sized against live production data (read-only `Content-Range`/count queries against `dodgy_deals_cache` directly, via its own anon key from `apps/mobile/.env.example` -- same key already shipped client-side): Home's unfiltered "Trending" pool (`Real Deal` verdict, last 7 days) is 4,596 rows live; the search "Dodgy" tab's pool is 1,693 `DODGY`-verdict rows; the full catalogue is 9,211 rows / ~8,700 distinct products. `/specials` (`specials/page.tsx`) turned out to have NO cap at all -- `filteredDeals.map(...)` straight into the grid, no slice, no button -- the actual worst offender, rendering the full catalogue-scale list unconditionally on "All Stores," worse than any of the 3 screens Jay named. So the right fix is about DOM/render cost (thousands of mounted cards), not DB fetching -- "Show next 100" undersells some lists (trending needs ~46 taps at 100/tap) and overshoots others (a narrow query might have 8 results total).

**Plan presented, 3 options (incremental reveal + hard cap / virtualize / do nothing) -- Jay picked incremental reveal.** Follow-up: asked whether this should be infinite scroll (auto-load on scroll) vs. a "Show more" tap, worried about backend cost. Answered directly: backend cost is identical either way -- both are pure client-side array slices of the same already-fetched data, this only matters for a screen backed by real server-side pagination (not this app's architecture). Jay chose infinite scroll given the backend concern was a non-issue.

**Implementation:** new `apps/mobile/src/hooks/useInfiniteReveal.ts` -- `IntersectionObserver`-driven reveal via a callback ref (not `useRef`+`useEffect`, so it correctly re-attaches if the sentinel mounts late, e.g. once async data arrives and a component's empty-state branch swaps to its real-content branch), chunked growth (`chunkSize` per call site, matching each list's old page-size constant), hard-capped at a new shared `INFINITE_REVEAL_MAX_ITEMS = 200` regardless of how far the user scrolls, reset to one chunk whenever the caller's memoized result array itself changes identity (`resetKey` — piggybacks on `useMemo`'s own dependency tracking instead of a second, driftable copy of the same filter/sort deps). `loadingRef` guard + `requestAnimationFrame` release prevents a fast flick-scroll from firing multiple reveals in one tick. Wired into all 4 spots: Home's `TrendingSection` (page.tsx), `FullScreenSearch.tsx`'s popular/dodgy tab AND its search-results list, and `/specials` (newly gated -- previously had none). Each spot's old "Show all N [deals|items]" button removed; replaced with an invisible sentinel `<div>` while more remains, or a "Showing top 200 of N -- narrow with filters/search" message once capped.

**Files touched:** `apps/mobile/src/hooks/useInfiniteReveal.ts` (new), `apps/mobile/src/app/page.tsx`, `apps/mobile/src/components/FullScreenSearch.tsx`, `apps/mobile/src/app/specials/page.tsx`.

**Verification status -- BLOCKED, not silently skipped:** real `tsc --noEmit -p apps/mobile/tsconfig.json` failed with clearly environmental errors -- `Cannot find name 'Boolean'`, `Cannot find global type 'Number'/'Object'/'CallableFunction'/'NewableFunction'`, `File '.../@types/node/index.d.ts' not found`. Confirmed via `ls -la` the file physically exists (3967 bytes, correct size) but a direct `head` read on it throws `Resource deadlock avoided` (EDEADLK) -- same root cause as this session's earlier iCloud-eviction incidents, now broader (previously hit arbitrary `apps/mobile` source files; now hitting `node_modules/@types` itself). Retried after a pause -- same result, not transient this time. `eslint` failed outright loading its own `debug` dependency, `Unknown system error -35`. `device_bash` has no network access, so I couldn't run `npm install`/reinstall from here to force fresh copies.

**Fallback verification done instead:** manual line-by-line review of all 4 files post-edit (re-read every changed region, confirmed no dangling references to the removed `isTrendingExpanded`/`isPopularExpanded`/`isSearchResultsExpanded` state, confirmed JSX nesting/brackets correct at both `FullScreenSearch.tsx` insertion points). `node --experimental-strip-types --check` on the new `.ts` hook file passed clean (the 3 `.tsx` call sites can't use this path -- Node's `--experimental-strip-types` doesn't strip JSX). This is explicitly weaker than a real `tsc`/`eslint` pass -- same documented lesson as this session's earlier iCloud incidents. **Needs a real `tsc --noEmit` + `eslint` + a manual click-through (scroll each of the 4 lists, confirm more items load, confirm the capped message appears somewhere with a very broad filter) once the iCloud issue clears.**

**Recommended to Jay (not yet actioned):** this is now the 3rd+ distinct iCloud-corruption incident this session, escalating in scope (now `node_modules/@types`, ESLint's own deps, arbitrary `packages/shared` test files) -- worth either excluding this project folder from iCloud sync, or moving it outside `~/Documents` entirely, and/or a `rm -rf node_modules && npm install` (npm confirmed via `package-lock.json`) to force fresh non-corrupted copies of the currently-unreadable files.

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 (cont. 6) -- Bug: leftover setIsSearchResultsExpanded/setIsPopularExpanded refs (my own mistake)

**Reported by Jay:** "setIsSearchResultsExpanded is not defined" -- straight after the (cont. 5) infinite-scroll change above.

**Root cause:** the cont. 5 edit removed the `isSearchResultsExpanded`/`setIsSearchResultsExpanded` and `isPopularExpanded`/`setIsPopularExpanded` state declarations and their two known call sites (the old "Show all" buttons), but missed two OTHER call sites: a dedicated `useEffect` (reset the old "show all" expansion whenever the search inputs changed) that called `setIsSearchResultsExpanded(false)`, and a tab-switch `onClick` handler that called `setIsPopularExpanded(false)`. My own post-edit verification pass was a grep for `isSearchResultsExpanded`/`isPopularExpanded` (lowercase i) -- which does NOT match `setIsSearchResultsExpanded`/`setIsPopularExpanded` (capital I right after "set"), a plain case-sensitivity bug in my own check, not a subtle one. Should have grepped case-insensitively (or for the setter names directly) the first time.

**Fix:** removed both leftover calls. The `useEffect` that only existed to call `setIsSearchResultsExpanded(false)` is deleted outright, not just edited -- confirmed (by reading `sortedProducts`'s own `useMemo` deps: `[products, trimmedQuery, selectedStores, resultsSortBy, priceFilter, resultsCategoryFilter]`, a superset of the old effect's dep list) that `useInfiniteReveal`'s own `resetKey: sortedProducts` already resets the reveal on every one of those same changes, so the effect was fully subsumed, not just broken. Same reasoning for the tab-switch handler's `setIsPopularExpanded(false)` line -- `sortedPopularSpecials`'s deps (`[popularSpecials, popularSortBy, popularTab, popularCategoryFilter]`) already cover the tab switch, so the line was just removed with an explanatory comment, no replacement logic needed.

**Re-verified this time, properly:** case-insensitive grep across all of `apps/mobile/src` for `setIs(Trending|Popular|SearchResults)Expanded` and the 3 old state names -- zero remaining real references (only hits left are inside this fix's own explanatory comments). Confirmed the fix actually landed on the live device file via a direct `grep` there too (not just trusting `device_commit_files`'s "written" response), per this session's own earlier-learned lesson about that.

**Still blocked:** real `tsc --noEmit` retried post-fix, same iCloud-corruption errors as (cont. 5) (`Cannot find global type 'Number'/'Object'`, `@types/node`/`@types/estree` unreadable) -- unrelated to this bug, still not resolved on Jay's end as of this entry. Real `tsc` would very likely have caught this exact class of mistake immediately (an undefined-name reference is squarely what it's for) -- this incident is a concrete argument for why getting real `tsc`/`eslint` working again (per (cont. 5)'s recommendation) matters, not a nice-to-have.

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 (cont. 7) -- Deal page Share icon: Share2 -> Share, circle removed

**Ask:** Jay pasted a reference icon image (the classic iOS/macOS "share sheet" glyph -- rounded box with an open top edge, an up-arrow shaft through the gap) with "change the deal assessment page share icon to this one (find it in icon libraries) don't use the circle outline around it."

**Identified the icon:** lucide-react ships both `Share2` (the 3-node/network "share" glyph -- what this page was already using, see the 2026-08-17/21 circle-styling entry above) and a separate `Share` export, which matches Jay's reference image (lucide's own take on the iOS "square and arrow up" share-tray shape). Confirmed both exist as distinct components via `dist/lucide-react.d.ts` (`declare const Share2: ...` / `declare const Share: ...`, no accompanying visual description in the type file). Could NOT visually confirm `Share`'s actual SVG path directly -- every attempt to read `node_modules/lucide-react/dist/esm/icons/share.mjs` (and the CJS bundle) hit the same iCloud eviction problem flagged in (cont. 5)/(cont. 6), this time on a file that's `stat`-readable (559 bytes) but not `read()`-able at all, `Blocks: 0` in `stat` output confirming it's an evicted-but-not-redownloaded iCloud placeholder, not corruption -- retried via `cat`, `python3 open()`, `cp`, `dd`, `file`, all failed identically with `Resource deadlock avoided`/`Errno 35`. Went with `Share` based on: (a) it being lucide's ONLY other "share"-named icon besides the one already in use, and (b) established knowledge of lucide's icon set (Share2 = 3-node network glyph, Share = the box+arrow-up "share tray" shape) rather than a guess. **Flagged, not silently assumed: Jay should visually confirm this is the right glyph once the dev server picks it up** -- this is the one piece of this change I could not independently verify against the actual SVG source.

**Fix, both per Jay's ask:**
1. Icon swap: `Share2` -> `Share` (import line + the one JSX usage).
2. Circle removed entirely, per "don't use the circle outline around it" -- this reverses the (cont. earlier, 2026-08-17/21) change that gave this button the same `rounded-full border border-stone-900 bg-white text-stone-900` circle as `AddToListButton` beside it. `className` now just `flex h-8 w-8 items-center justify-center text-stone-900 transition-opacity hover:opacity-70` -- kept the `h-8 w-8` tap-target size and `block` on the icon (unrelated to the circle, no reason to shrink the hit area or reintroduce the inline-baseline centering issue that `block` was added to fix). `hover:bg-stone-50` (a fill-color hover, meaningless without a fill) replaced with `hover:opacity-70`.

**Flagged, not silently glossed over:** the Share/AddToListButton "matched pair" circle styling this session built up over several turns is now asymmetric again -- Share is bare, Add to List still has its white-fill circle. Not changed without being asked; flagged here in case Jay wants Add to List's circle dropped too as a follow-up.

**Mechanics note:** this file (`apps/mobile/src/app/deal/[id]/[store]/page.tsx`) is 8 folders below the connected root -- `device_stage_files` refuses it outright ("too deeply nested to stage... at most 7 are supported"), so this edit couldn't go through the usual stage-in-container/Edit-tool/commit-back flow at all. Worked around by writing the find-and-replace as a small Python script in the container, base64-encoding it, decoding it straight into `/tmp` on the device via `device_bash`, and running it there against the live file directly -- `device_bash` has no such depth limit. Verified after the fact with a direct `grep` on the live device file (not just the script's own exit code), per this session's own already-learned lesson about this specific file.

**Verification status:** same `tsc --noEmit` block as (cont. 5)/(cont. 6) (unrelated `@types`/global-lib read failures), retried post-edit, unchanged. `grep` on the live file confirms: `Share2` no longer imported or referenced anywhere except this entry's own explanatory comment text; `Share` imported once, used once; button `className` no longer contains `rounded-full`/`border`/`bg-white`. Manual review only -- needs a real `tsc`/`eslint` pass and Jay's own visual check once the iCloud issue clears.

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 (cont. 8) -- Cheaper-alternatives carousel: hint STILL not reaching edge (re-fixed for real this time), card height bumped again

**Ask:** Jay pasted 2 screenshots of the "cheaper alternatives" carousel card ("Go to PAK'nSAVE" button visible, cropped tight against the card's bottom edge) with: "fix the cheaper options carousels - so the card hints (left and right) reach the actual edge of the container, and ignore the inner margins or paddings. Carousel card heights need to be larger to accommodate the button, currently it's cropped at the bottom, or squished in, missing proper bottom padding."

**Issue 1 root cause (this time actually re-derived by hand, not re-applied by pattern-match):** the (cont. 3) fix from earlier this same day put `-mx-5` on a `<div>` that is a DIRECT CHILD of the `motion.div` wrapping this whole carousel section. That `motion.div` already carries `overflow-hidden` (required for its own `height: 0 -> "auto"` open/close animation) and has NO padding of its own. `overflow: hidden` clips at the padding edge of whichever element it's set ON -- so the child `div`'s `-mx-5` (which tries to extend 20px past ITS OWN parent, i.e. past `motion.div`'s own edges) was being clipped away by `motion.div` itself before ever reaching the verdict card's real border. Net effect: visually IDENTICAL to no `-mx-5` at all -- the (cont. 3) fix was a genuine no-op, not almost-right. Re-derived this via the actual CSS box model (negative margin width math + where `overflow: hidden` clips), not by guessing a slightly different class value and hoping.

**Fix 1:** moved `-mx-5` from the inner div onto `motion.div` itself (`className="-mx-5 overflow-hidden"`) -- now `overflow-hidden` clips relative to `motion.div`'s OWN already-widened box, so there's nothing left to clip away. The old wrapper div keeps only `pt-3`. `InsightCarousel`'s `trackPaddingClassName="px-5"` / `slideWidthClassName="w-[92%]"` untouched -- those were never the problem, the clipping ancestor was.

**Issue 2 root cause:** `h-64` (256px fixed card height, set cont. 3 for the "always the same height" ask) was genuinely too short for this card's own worst-case content -- 2-line clamped product name + the save badge's own 2-line-wrapping fixed copy + the price/store-badge row + `pt-7`/`pb-5`/`gap-4` + the button, all real vertical space. Content was overflowing past the card's own declared height with nothing to clip it, so `justify-between`'s bottom-pinned "Go to X" button had nowhere real left to pin to inside a too-short box -- exactly the "cropped"/"squished, missing bottom padding" look in Jay's screenshots.

**Fix 2:** `h-64` -> `h-72` (32px more) on the card itself, plus its own `line-clamp-2` comment and the big same-height comment's `h-64` mention updated to match (both were about to go stale/misleading otherwise). The save badge's text is fixed copy (not user data), so the worst-case height this needs to cover is a real, bounded ceiling, not an open-ended guess.

**Mechanics note:** same bracket-path depth-limit workaround as (cont. 7) -- `device_stage_files` still refuses this file (8 folders deep), so this went through the same "write a Python find/replace script in the container, base64 it into `device_bash`, run it against the live file directly" flow. 6 distinct string replacements, each asserted to match exactly once before being applied (so a stale assumption about the file's current text would fail loudly instead of silently corrupting something else). Verified after the fact with a direct `grep` on the live device file (all 6 changes present, `h-64` only remains in comments that are correctly describing PAST state, `-mx-5` correctly on `motion.div` not the inner div) -- not just trusting the script's own "OK" printout, per this session's own already-learned lesson about this specific file.

**Verification status:** manual review + the grep confirmation above only -- `tsc --noEmit` still blocked by the same iCloud eviction issue as (cont. 5)/(cont. 6)/(cont. 7), unresolved on Jay's end as of this entry. Needs a real `tsc`/`eslint` pass AND Jay's own visual check (open the deal page, expand "See cheaper options", confirm the peek now reaches the card's true edge and the button has real breathing room) once that's sorted -- I have no way to render this app and see it myself.

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 (cont. 9) -- Share icon size bump; Trending tab: new sort options; Trending tab: Categories filter added

**Ask (Jay verbatim, 3 parts in one message):** "Increase the size of the new share icon slightly to match the size of the add to list button. Sort by option on the Trending tab - options should be 'Lowest to highest price' 'Latest specials'. Add the categories sort button (existing from the full search screen) to the trending tab."

**Part 1 -- Share icon size:** the deal page's Share icon (swapped `Share2` -> `Share`, circle removed, cont. 7) was still `h-5 w-5` inside its own `h-8 w-8` button -- sat visibly smaller than its button's own tap target. Read "match the size of the add to list button" literally as the BUTTON's own 32px footprint, not Add To List's inner icon (already `h-5 w-5`, same size Share started at -- "increase" wouldn't mean anything under that reading). Bumped to `h-8 w-8`, filling the button the way Add To List's own icon does relative to its button. **Flagged for Jay's own visual confirmation** -- this is one reasonable reading of the ask, not the only one; if the button footprint itself is meant to shrink to match the icon instead, that's the opposite change.

**Part 2 -- Trending sort options:** Trending and My List previously shared one `SortBy` type/`SORT_OPTIONS` ("Biggest discount"/"Dodgy first") via one `SortDropdown`. Per this ask, Trending now gets its own distinct options -- gave it a separate `TrendingSortBy` type (`"price-asc" | "latest"`) and `TRENDING_SORT_OPTIONS`, rather than adding 2 more values onto the shared `SortBy` union, since My List keeps its original two options unchanged and a single 4-option union would let either screen wire up options meant for the other with nothing catching it at the type level. `SortDropdown` made generic (`SortDropdown<T extends string>`, `options` now a prop instead of always reading module-level `SORT_OPTIONS`) so both screens still share the one dropdown/bottom-sheet component and markup -- only the option lists diverge. New `sortTrendingDeals()` alongside the existing `sortDeals()`: `"price-asc"` sorts by `deal.price` ascending; `"latest"` sorts by `deal.saleStartedAt` descending (most recently started first; missing `saleStartedAt` sorts last, defensively -- shouldn't normally happen for a qualifying Trending entry). Default `trendingSortBy` changed `"discount"` -> `"latest"`, since `"discount"` is no longer a valid `TrendingSortBy` value; picked `"latest"` over `"price-asc"` as more in keeping with "Trending real savings this week"'s own framing. **Flagged: this default is my own interpretive call, not stated in the ask** -- easy to swap if Jay wants `"price-asc"` as the default instead.

**Part 3 -- Trending Categories filter:** `FullScreenSearch.tsx` already had this exact pattern (a `CATEGORY_SECTIONS` grouping + a "Categories" button opening a bottom-sheet of category pills, disabling ones with zero matching results). Per this codebase's own established "promote to shared the moment a SECOND screen needs the identical list" convention (already applied this session to `matchesAnySelectedStore`, `deriveAvailableStoreKeys`, `STORE_PILL_ORDER`), promoted `CATEGORY_SECTIONS` out of `FullScreenSearch.tsx` into `packages/shared/src/deal-detail.ts` (next to `groupCategory`/`CATEGORY_GROUPS`, which it depends on category-name-for-category-name) rather than writing Home's own second copy. `FullScreenSearch.tsx`'s local const removed, its shared import extended.

On `page.tsx`: added `trendingCategoryFilter` state (multi-select `string[]`, empty = all categories, mirrors `FullScreenSearch`'s `activeCategoryFilter`). Restructured the old single `trendingDeals` memo into a pipeline -- `trendingDealsAllCategories` (the pre-category-filter set, was the old `trendingDeals` body; dropped its own `.sort()` since `TrendingSection` always re-sorts via `sortTrendingDeals` regardless, so the old pre-sort there was redundant even before this change) feeds `trendingCategoryCounts` (per-category counts over the unfiltered set, for the sheet's disabled-pill state) and `trendingAvailableCategories` (which categories exist at all right now, so the sheet only shows real sections), and the final `trendingDeals` filters `trendingDealsAllCategories` down by `trendingCategoryFilter`. `TrendingSection` rewritten to take these as new props, own its own `isCategorySheetOpen` local state + `toggleCategory` helper, and render a Categories button (same styling as the new generic `SortDropdown`'s own button) beside the Sort dropdown, plus the full bottom-sheet -- copied from `FullScreenSearch.tsx`'s Categories sheet class-for-class (same bottom-sheet shape every sheet in this app already uses), with `categoryDodgyCounts`/"No dodgy deals in this category right now" generalized to this rail's own `categoryCounts`/"No trending deals in this category right now" (Trending isn't the dodgy/popular-tab context that copy came from). `useInfiniteReveal`'s existing `resetKey: sorted` already covers the new filter with no extra wiring -- `sorted` is derived from `deals`, and `deals` (i.e. `trendingDeals`) already changes reference whenever `trendingCategoryFilter` changes.

**De-duplication:** `CATEGORY_SECTIONS` now has exactly one definition (`packages/shared/src/deal-detail.ts`), imported by both `FullScreenSearch.tsx` and `page.tsx` -- avoids a second copy quietly drifting from the first, same reasoning as every other shared-promotion this session.

**Files touched:** `packages/shared/src/deal-detail.ts`, `apps/mobile/src/components/FullScreenSearch.tsx`, `apps/mobile/src/app/page.tsx`, `apps/mobile/src/app/deal/[id]/[store]/page.tsx`.

**Mechanics note:** the deal page edit (Part 1) used the same base64-Python-script-via-`device_bash` workaround as (cont. 7)/(cont. 8) -- that file is still 8 folders deep and `device_stage_files` still refuses it outright. Verified after the fact with a direct `grep` on the live device file, not just the script's own printout, per this session's own already-learned lesson about this specific file. The other 3 files went through the normal stage/Edit/`SendUserFile`/`device_commit_files` flow, each also re-confirmed afterward with a direct `grep` on the live device copy.

**Verification status -- NOT fully clean, flagged rather than glossed over:** the iCloud file-eviction issue (cont. 5 onward) is STILL present, re-checked this entry -- `node_modules/@types/node/index.d.ts` still shows `Blocks: 0` in `stat` and still throws `Resource deadlock avoided` on a direct read, so real `tsc --noEmit -p apps/mobile/tsconfig.json` and `eslint` remain blocked, unresolved on Jay's end as of this entry (this is now several entries running with no change -- worth Jay actually running the `rm -rf node_modules && npm install` / iCloud-exclusion fix recommended back in cont. 5, since manual review is a real but weaker substitute). Fallback verification done instead: syntax-only parse of all 3 non-bracket-path files via `esbuild` (catches malformed JS/TS/JSX -- mismatched braces, broken tags -- but NOT type errors, which is exactly the class of mistake cont. 6's bug was), all 3 passed clean; manual review of every edited region for correct prop threading (`TrendingSection`'s new props all wired at its one call site, `SortDropdown<T>`'s two call sites both pass `options` now) and no leftover references to the old shared `SortBy`/`SORT_OPTIONS` inside `TrendingSection` specifically (My List's own use of `SortBy`/`sortDeals`/`SORT_OPTIONS` deliberately left unchanged and confirmed still intact). Needs a real `tsc`/`eslint` pass once the iCloud issue clears, and Jay's own visual check on all 3 parts (icon size, the two new Trending sort labels/behaviour, the new Categories sheet on Trending matching the search screen's one).

Not committed to git (working tree left as-is, Jay's own call on when to commit).

## 2026-08-21 (cont. 10) -- Share icon: dialed back, h-8 -> h-6

**Ask:** "Make the share icon a bit smaller, it looks too big now." -- direct feedback on (cont. 9) Part 1, once Jay actually saw the rendered `h-8 w-8` (32px) version.

**Fix:** `h-8 w-8` -> `h-6 w-6` (24px) on the Share icon itself (button wrapper untouched, still `h-8 w-8` -- only the icon inside it changed). Landed between the original `h-5 w-5` (20px, before cont. 9) and the too-big `h-8 w-8` attempt, matching the original ask's own wording better in hindsight -- "slightly" larger than where it started, not a full match to the button's own footprint.

**Mechanics note:** same base64-Python-script-via-`device_bash` workaround as (cont. 7)/(cont. 8)/(cont. 9) -- file still 8 folders deep, still refused by `device_stage_files`. Verified with a direct `grep` on the live device file after running.

**Verification status:** single-string replacement, asserted to match exactly once before applying. `tsc`/`eslint` still blocked by the same unresolved iCloud eviction issue as every entry since (cont. 5). Needs Jay's own visual confirmation this size reads right now.

Not committed to git (working tree left as-is, Jay's own call on when to commit).
