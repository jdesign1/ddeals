"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Check, X } from "lucide-react";
import {
  fetchUserLists,
  fetchListIdsContainingProduct,
  addItemToList,
  removeItemFromList,
  invalidateListsPageCache,
  LIST_MEMBERSHIP_CHANGED_EVENT,
  describeFetchError,
  type ListRow,
} from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import LoadingMascot from "@/components/LoadingMascot";

/**
 * "+" add-to-list action on Specials (S8) cards. Specials/page.tsx
 * originally omitted this entirely because Lists/S1 didn't exist yet
 * (project.md, S8 session note) -- now that lists.ts + S1 are real, this
 * closes that flagged gap rather than leaving it as a separate pass, per
 * the Phase 1 roadmap's own instruction ("close Design vs Prototype Gaps
 * as each relevant screen is built").
 *
 * Adds the product generically (not pinned to the specific store the card
 * was shown at) -- `list_items` only stores `product_id`, and the list
 * card's own summary always recomputes the current cheapest store/price
 * live, so this is consistent with how totals are computed, not a
 * simplification that produces wrong numbers.
 *
 * `containerClassName` (2026-08-12, per Jay's ask to reuse this exact
 * button -- small circle, white fill, black outline/icon -- beside the
 * Share icon on the deal-assessment page, replacing that page's own
 * separate full-width sticky "Add to List" bar) lets a caller override the
 * wrapper's positioning. Defaults to the original `absolute right-2 top-2
 * z-10` every card usage (`ProductListCard`/`DealCard`) still relies on to
 * float the button over a product image; the deal-assessment page instead
 * passes `"relative"` so it sits inline in a normal flex row next to
 * Share, with the sheet below opening the same regardless of this prop
 * (it's portaled, see below, so it doesn't actually anchor to this
 * wrapper's position any more).
 *
 * `buttonClassName` (same day, same deal-assessment reuse, second follow-
 * up ask: "no background fill" on that page specifically) lets a caller
 * override the button's own look, independent of the wrapper's position.
 * Defaults to the original solid `bg-white` circle every card usage still
 * needs (a white fill against a busy product photo is what makes the
 * button legible there at all); the deal-assessment page instead passes a
 * variant with no `bg-white`/`shadow`, just the border + icon, since it
 * sits on a plain white card background there and doesn't need a fill to
 * read clearly.
 *
 * List picker switched from a small absolute-positioned dropdown to a full
 * bottom sheet (2026-08-14, Jay: "When selecting add to list icon from a
 * product item card, use a bottom sheet to select a list, use the default
 * height also, so it's not too low on the screen") -- same scrim + spring
 * slide-up + `min-h-[45vh]` recipe every other sheet in this app uses
 * (AppHeader.tsx's account menu, lists/page.tsx's create-list sheet). The
 * old click-outside `mousedown` listener is gone along with the dropdown
 * -- the sheet's own full-viewport scrim now covers every "outside" tap,
 * same as AppHeader's own sheet.
 *
 * Rendered via `createPortal` into `document.body` rather than nested in
 * this component's own small trigger wrapper -- the first portal in this
 * codebase, worth flagging why. Every card that uses this button
 * (`ProductListCard`, `DealCard`) wraps its whole card in a `relative
 * overflow-hidden` clickable container, and `BottomNav`/`AppHeader` are
 * real siblings elsewhere in the tree at their own fixed z-index tiers
 * (z-40/z-[45]) -- nesting a `fixed` sheet inside that card container
 * risks the exact bug `AppHeader.tsx`'s own doc comment already
 * documents once (a positioned ancestor with any z-index traps a nested
 * `fixed` descendant inside its own stacking context, so the descendant's
 * own z-index only wins against siblings *inside* that same trapped
 * context, not real page-level siblings like BottomNav), on top of a
 * second, separate risk this component's cards add that AppHeader's
 * sheet never had to deal with: `overflow-hidden` on the card. A portal
 * sidesteps both at once by attaching the scrim/sheet directly to
 * `document.body`, outside every card's DOM subtree, so they paint in the
 * real top-level stacking order and are never clipped by a card's own
 * `overflow-hidden`. React still bubbles *synthetic* events up the
 * component tree (not the DOM tree) through a portal, though, so the
 * scrim/sheet's own click handlers still call `stopPropagation()` --
 * without it, tapping inside the sheet would still trigger the card's own
 * `onClick`/`goToDeal` navigation, exactly as if the sheet were nested
 * normally. `typeof document !== "undefined"` guards the one render pass
 * that happens on the server, where `document` doesn't exist -- `open`
 * can only ever become `true` from a real browser click, so by the time
 * anything is actually portaled this is always running client-side; the
 * guard only exists to keep the *unconditional* `createPortal` call
 * (needed so `AnimatePresence` can still play its exit animation on close,
 * rather than yanking the sheet out instantly) from throwing during SSR.
 *
 * Trigger icon now reflects real "already saved" state, and the sheet's
 * own rows toggle add/remove instead of only ever adding (2026-08-20, per
 * Jay: "Items already on your list should show a ticked icon on their
 * product cards, not an Add icon. Selecting the tick icon opens the
 * bottom sheet to allow the user to unselect it from a list"). `addedTo`
 * used to start empty every mount and only ever gain entries from taps
 * made during that same button's own open sheet -- correct for "did I just
 * add this," useless for "is this already on a list from a previous
 * visit," which is what the trigger icon itself needs to know before the
 * sheet is ever opened. A new effect fetches the real answer
 * (`fetchListIdsContainingProduct`, `lists.ts`, added alongside this
 * change -- a plain `product_id` filter against `list_items`, relying on
 * that table's own RLS to scope results to the caller's own lists, see
 * that function's own doc comment) and seeds `addedTo` from it as soon as
 * `user` is known, rather than waiting for the sheet to open the way the
 * list *names* (`lists`/`handleOpen` below) still do -- the icon has to be
 * right before any tap happens, the list names don't need to be fetched
 * until the sheet listing them actually opens.
 *
 * `handleAdd` renamed `handleToggle` and now branches on `addedTo.has
 * (listId)`: adds via the existing `addItemToList` when not yet on that
 * list, removes via the new-to-this-callsite `removeItemFromList` (already
 * existed in `lists.ts`, just never called from here) when it already is.
 * The sheet's per-list row was always the full tap target either way --
 * this doesn't add a second control, it changes what the existing tap
 * does once a list already has a checkmark next to it.
 *
 * One tradeoff, flagged rather than silently accepted: this effect fires
 * once per mounted `AddToListButton`, and every product card on a page
 * renders its own instance -- a grid of N cards signed-in means N
 * concurrent `fetchListIdsContainingProduct` calls, not one batched
 * lookup. Each is a small, indexed (`list_items_product_id_idx`), RLS-
 * scoped single-column select, not a heavy query, but it's still N round
 * trips where a page-level "which of my lists contain each of these
 * product ids" batch fetch (passed down as a prop, `ListPriceLookups`\-
 * style) would be one. Not built this session -- that's a real
 * architecture change (every card-rendering page would need to own and
 * pass down that lookup), out of scope for "show the right icon," and
 * this component is deliberately self-contained today (see the portal
 * section above). Worth revisiting if a page with a large product grid
 * shows a real egress/latency cost from it.
 */
export default function AddToListButton({
  productId,
  containerClassName = "absolute right-2 top-2 z-10",
  buttonClassName = "flex h-7 w-7 items-center justify-center rounded-full border border-stone-900 bg-white text-stone-900 shadow",
  iconClassName = "h-4 w-4",
}: {
  productId: string;
  containerClassName?: string;
  buttonClassName?: string;
  // Added 2026-08-21, per Jay: "make share and add to list [icons]
  // slightly larger" on the deal-assessment page specifically -- the
  // trigger icon's size used to be hardcoded (`h-4 w-4` on both the Plus
  // and Check glyphs below), so bumping it for just that one page's call
  // site was impossible without either a prop or a second copy of this
  // whole component. Every OTHER caller (`ProductListCard`, `DealCard`)
  // keeps the same default `h-4 w-4` it always had -- only the
  // deal-assessment page passes an override, matching how
  // `buttonClassName`/`containerClassName` already work per-caller.
  iconClassName?: string;
}) {
  const { user, openAuthSheet } = useAuth();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Seeds `addedTo` from real list membership as soon as `user` is known --
  // see this file's own top-of-file doc comment ("Trigger icon now
  // reflects real 'already saved' state...") for why this can't wait for
  // the sheet to open the way `lists`/`handleOpen` below still does. The
  // `cancelled` guard is the standard "ignore a stale response" pattern for
  // an async effect -- this component can unmount (e.g. its card scrolls
  // out of a virtualized/paginated list) before the request resolves.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchListIdsContainingProduct(getSupabaseClient(), productId)
      .then((listIds) => {
        if (!cancelled) setAddedTo(new Set(listIds));
      })
      .catch((err) => {
        if (!cancelled) setError(describeFetchError(err, "Failed to check saved lists"));
      });
    return () => {
      cancelled = true;
    };
  }, [user, productId]);

  async function handleOpen() {
    setOpen(true);
    if (user && lists === null) {
      try {
        const rows = await fetchUserLists(getSupabaseClient());
        setLists(rows);
      } catch (err) {
        setError(describeFetchError(err, "Failed to load lists"));
      }
    }
  }

  // Renamed from `handleAdd` (2026-08-20, see this file's own top-of-file
  // doc comment) -- now toggles add/remove based on whether `productId` is
  // already on `listId`, instead of only ever adding.
  async function handleToggle(listId: string) {
    const alreadyOnList = addedTo.has(listId);
    try {
      if (alreadyOnList) {
        await removeItemFromList(getSupabaseClient(), listId, productId);
        setAddedTo((prev) => {
          const next = new Set(prev);
          next.delete(listId);
          return next;
        });
      } else {
        await addItemToList(getSupabaseClient(), listId, productId);
        setAddedTo((prev) => new Set(prev).add(listId));
      }
      // Busts the Lists page's own cached data (2026-08-20, added alongside
      // that page's new `loadListsPageData` cache -- see lists.ts's own
      // doc comment on it) -- this button mutates the exact same
      // `list_items` rows that cache is built from, even though it's never
      // rendered ON the Lists page itself (only on `ProductListCard`, i.e.
      // Home/Search). Without this, adding/removing an item here would
      // leave the Lists tab showing a stale item count/total for up to
      // that cache's 60s TTL the next time the user opens it. `user` is
      // guaranteed non-null here -- `handleToggle` is only ever reachable
      // via a row tap inside the sheet, which itself only renders once
      // `!user` has already been handled (this file's own JSX below).
      if (user) invalidateListsPageCache(user.id);
      window.dispatchEvent(new Event(LIST_MEMBERSHIP_CHANGED_EVENT));
    } catch (err) {
      setError(describeFetchError(err, alreadyOnList ? "Failed to remove item" : "Failed to add item"));
    }
  }

  // Whether this product is on at least one of the user's lists -- drives
  // the trigger icon swap (Plus -> Check) below. See this file's own
  // top-of-file doc comment for where `addedTo` gets seeded from.
  const isSaved = addedTo.size > 0;

  return (
    <div className={containerClassName}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Signed-out tap goes straight to the real sign-in/create-account
          // sheet now (2026-08-19, per Jay: "Selecting an add to list
          // button anywhere in the app (when logged out) should link to
          // the login create account bottom sheet") -- previously this
          // still opened the list-picker sheet first (`setOpen`/
          // `handleOpen` below), which then showed its own "Log in to save
          // items" link/button inside (see that branch further down,
          // fixed earlier the same day to actually call `openAuthSheet`
          // instead of navigating to `/lists`). That was a real fix but
          // still an extra tap through a sheet with nothing else usable in
          // it for a signed-out visitor -- this button is used everywhere
          // in the app (`ProductListCard`, `DealCard`, the deal-assessment
          // page), so it's the one place a blanket "logged out -> straight
          // to auth" rule covers every add-to-list entry point at once.
          // The list-picker sheet's own `!user` branch is left in place
          // as a defensive fallback (e.g. a session expiring while the
          // sheet happens to already be open), not removed as dead code.
          if (!user) {
            openAuthSheet("Log in to save items to a list.");
            return;
          }
          if (open) setOpen(false);
          else handleOpen();
        }}
        aria-label={isSaved ? "Manage lists for this item" : "Add to list"}
        aria-pressed={isSaved}
        className={buttonClassName}
      >
        {isSaved ? (
          // Tick instead of the plain Plus once this product is on at
          // least one list (2026-08-20, per Jay: "Items already on your
          // list should show a ticked icon on their product cards, not an
          // Add icon"). Was tinted brand-primary green via an explicit
          // `style` override -- switched to black (2026-08-20, same day,
          // per Jay: "Make the added to list tick icon black") by simply
          // dropping that override: with no `style`/color class of its own,
          // the icon now inherits `buttonClassName`'s own text color via
          // `currentColor`, same as the `Plus` branch below already does.
          // That's every caller's own black/near-black (`text-stone-900`
          // on the default card `buttonClassName`, same on the deal-
          // assessment page's own override just above) rather than a
          // second hardcoded color to keep in sync -- simpler than the
          // green version's own reasoning (tinting explicitly so the
          // "saved" cue read consistently under either caller's chrome),
          // and correct now that black *is* what every caller's chrome
          // already uses for its icons anyway. The sheet's own per-list
          // checkmark further down (`lists.map` below) is DELIBERATELY
          // left green/`--color-brand-primary` -- Jay's ask named "the
          // added to list tick icon" (singular), matching the trigger this
          // session's other asks keep referring to (e.g. "match the add to
          // list icon" for the Share button just above), not the sheet's
          // own internal per-row indicator, which was never in scope here.
          <Check className={`block ${iconClassName}`} strokeWidth={3} aria-hidden="true" />
        ) : (
          <Plus className={`block ${iconClassName}`} strokeWidth={3} aria-hidden="true" />
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="add-to-list-scrim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                  }}
                  className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
                />
                <motion.div
                  key="add-to-list-sheet"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 220 }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
                >
                  <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 py-4">
                    {/* Bottom-sheet title style unified app-wide 2026-08-19 --
                        was a small tracking-widest text-stone-500 eyebrow
                        label, now a real title, same class every bottom
                        sheet's top title uses (see app/page.tsx's Sort sheet
                        for the full cross-reference). `<h3>`, not `<span>`,
                        to match. */}
                    <h3 className="dd-type-sheet-title text-stone-900">Add to list</h3>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpen(false);
                      }}
                      aria-label="Close"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  {!user ? (
                    <div className="px-5 py-6">
                      {/* Was `<Link href="/lists">` -- routed a signed-out
                          tap to the Lists tab instead of the actual sign-in/
                          create-account sheet, same bug AppHeader.tsx's own
                          "Create account / log in" menu item had (see that
                          file's own comment). Fixed 2026-08-19, per Jay:
                          "ensure all links... which mention create account
                          or sign in actually link to the new sign in create
                          account bottom sheet" -- now closes this list-picker
                          sheet and opens the real `AuthSheet` via
                          `openAuthSheet()`, same as every other log-in entry
                          point in the app. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpen(false);
                          openAuthSheet("Log in to save items to a list.");
                        }}
                        className="cursor-pointer text-sm font-bold text-stone-700"
                      >
                        Log in to save items
                      </button>
                    </div>
                  ) : lists === null ? (
                    <LoadingMascot loading />
                  ) : lists.length === 0 ? (
                    <div className="px-5 py-6">
                      <Link
                        href="/lists"
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-bold text-stone-700"
                      >
                        Create a list first
                      </Link>
                    </div>
                  ) : (
                    <ul className="flex flex-col divide-y divide-stone-100 pb-safe-sm">
                      {/* Row tap now toggles add/remove instead of only
                          adding (2026-08-20, see this file's own
                          top-of-file doc comment / `handleToggle`) -- a
                          row already showing the checkmark below removes
                          `productId` from that list on tap, same as
                          `list.id`'s own `aria-pressed` reflects. */}
                      {lists.map((list) => (
                        <li key={list.id}>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggle(list.id);
                            }}
                            aria-pressed={addedTo.has(list.id)}
                            className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50"
                          >
                            <span className="truncate">{list.name}</span>
                            {addedTo.has(list.id) && (
                              <Check
                                className="h-4 w-4 shrink-0"
                                style={{ color: "var(--color-brand-primary)" }}
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {error && (
                    <p className="px-5 pb-4 text-[13px] leading-4 font-medium" style={{ color: "var(--color-brand-error)" }}>
                      {error}
                    </p>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
