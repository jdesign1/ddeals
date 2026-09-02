"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Store, Plus, Check, X, ChevronDown } from "lucide-react";
import {
  createList,
  deleteList,
  updateListName,
  removeItemFromList,
  loadListsPageData,
  invalidateListsPageCache,
  LIST_MEMBERSHIP_CHANGED_EVENT,
  describeFetchError,
  type ListRow,
  type ListItemRow,
  type ListSummary,
  type ListItemProductMeta,
  type ProductCard as ProductCardData,
} from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import { supabaseConfig } from "@/lib/config";
import ErrorState from "@/components/ErrorState";
import SearchBar from "@/components/SearchBar";
import ListItemProductCard from "@/components/ListItemProductCard";
import LoadingMascot from "@/components/LoadingMascot";
import BottomSheetPortal from "@/components/BottomSheetPortal";

/**
 * S1 — My Lists, per project.md's Stitch screen inventory. First real
 * (auth-gated, persisted) screen built on top of the 2026-08-08
 * lists/list_items schema.
 *
 * Deliberate simplifications vs. the Stitch mock, flagged here rather than
 * faked (see also lists.ts's ListSummary doc comment):
 *  - "Create New List" here is name-only, not the full S2/S6 modal (store
 *    selection, import shortcuts) -- that's separate UI work on this same
 *    schema, not built this session.
 *  - No Historic Low label, no savings-goal progress card, no Retailer
 *    Synergy card -- none of these have a real, non-invented data source
 *    yet (a goal needs a user-set target that doesn't exist; Retailer
 *    Synergy needs a 2-store-split optimizer that doesn't exist). Omitted
 *    rather than shown with fabricated numbers.
 *  - share/more-vert menu (S7) isn't built -- only a direct delete action.
 *
 * Restyled 2026-08-09 (Jay: "improve designs") -- the create-list
 * form/button and `ListCard`'s badges were still on the older plain/Stitch
 * look (`rounded-full` `var(--color-brand-primary)` pills, no focus rings)
 * this app has mostly moved on from; brought in line with the
 * `bg-stone-900`/`hover:bg-ink-600` CTA + `ink-*` focus-ring conventions
 * Home/AppHeader/AuthPanel now use. Also fixed a real, previously
 * unnoticed color inconsistency: "SAVED"/"Verified Special" here used
 * `var(--color-brand-primary)` (#006948, the older Stitch green) while
 * every other "genuine/real savings" indicator in the app (ProductListCard's
 * "Real" badge) uses the `fair-600` token (#56a26a) -- two different greens
 * meaning the same thing. Both now use `fair-600`.
 *
 * The 3 "Lists"/"My Lists" `<h1>`s (loading state, signed-out state, real
 * content) are gone as of 2026-08-13, per Jay's "remove the h1 titles from
 * each page, as we have the title in the top nav bar" -- `AppHeader.tsx`
 * already shows "My List" for this route via `ROUTE_TITLES`.
 *
 * Create-list flow and the page-local "Log out" button both reworked
 * 2026-08-14, three separate asks:
 *  - "change the create list function ... a dedicated button in the bottom
 *    right (plus icon) ... bring up a bottom sheet that asks for the name
 *    of the list" -- the inline text input + "Create new list" button that
 *    used to sit under the header (the `justify-end` row the paragraph
 *    above used to describe) is gone; a fixed circular `+` button, bottom-
 *    right, opens a bottom sheet with the same name input + submit button
 *    instead. Sheet follows the exact scrim + spring slide-up recipe
 *    `AppHeader.tsx`'s own account menu (and every other bottom sheet in
 *    this app) already uses. `createError` is a separate, sheet-local
 *    error string rather than reusing the page's own `error`/`ErrorState`
 *    banner -- that banner renders in the scrollable content behind the
 *    sheet, which a user wouldn't see while the sheet is still open over
 *    it.
 *  - "remove the old create new list button and list name entry box" --
 *    same ask, the removal half.
 *  - "remove the logout button from lists page" -- this page's own
 *    top-right "Log out" button (the one the removed paragraph above used
 *    to describe) is gone outright, not relocated; signing out is still
 *    reachable from `AppHeader`'s global account menu and `/account`, both
 *    unaffected. With that header row gone entirely (not just its button),
 *    the gap between `SearchBar` and whatever renders next (the test-mode
 *    banner, empty state, or the list itself) is now just this `<main>`'s
 *    own flex gap, same spacing every other flex-col page in this app
 *    already uses between its own direct children -- no longer a bespoke
 *    top padding on a row that no longer exists.
 *
 * "My list page changes" batch, 2026-08-15 (six separate asks, same
 * session):
 *  - Search bar placeholder text ("Search items to add to your lists")
 *    and the grey-page/white-shadow-pill treatment are `SearchBar.tsx`
 *    prop changes (`placeholder`, `variant="shadow"`), passed at all three
 *    `<SearchBar />` call sites below (loading/signed-out/real-content) so
 *    the copy and look agree in every state this page can render, not just
 *    the happy path -- see that component's own doc comment for the full
 *    "why".
 *  - `ListCard`'s trash-icon confirm state now replaces the WHOLE card's
 *    content (name row, badges, everything) with a centered "Delete?"
 *    prompt and larger (`h-12 w-12` circles, `h-6 w-6` icons -- was `h-6
 *    w-6`/`h-3.5 w-3.5`) confirm/cancel controls, instead of the old
 *    small top-right-only tick/cross pair, per Jay: "make the whole card
 *    change to the delete state, and make the Delete text - tick and
 *    cross larger and centred."
 *  - `ListCard`'s outer `border border-stone-200` is gone, replaced with
 *    `shadow-sm` (Jay: "no border line, but instead a short drop shadow
 *    (subtle)"). The card's own internal `border-t` dividers (the
 *    edit-mode item list below, unrelated to the outer card boundary Jay
 *    was pointing at) are untouched -- flagged as a judgment call rather
 *    than stripped along with it.
 *  - The create-list FAB is white with a black icon now (was solid
 *    `bg-stone-900`/white), per Jay: "update the add a list large icon to
 *    be white by default with black icon." Kept `shadow-lg` so it still
 *    reads as a floating control against this page's own grey base fill,
 *    rather than nearly disappearing into it the way a plain white circle
 *    on `bg-stone-50` would.
 *  - Route title is "Lists" now, not "My List" -- see `AppHeader.tsx`'s
 *    own `ROUTE_TITLES` entry for that one-line change and why nothing
 *    else (BottomNav's tab label, this feature's own internal "My List(s)"
 *    naming throughout this file's doc comments) changed alongside it.
 *  - "Allow lists to be edited, and items removed" is the one real new
 *    feature in this batch, not a restyle: each `ListCard` now has a
 *    pencil icon next to the trash icon (`isEditing` state) that turns the
 *    list name into an inline `<input>` (saved via the new
 *    `updateListName` -- lists.ts previously had no update path, only
 *    create/delete) and reveals that list's own items underneath, each
 *    with an X button (`removeItemFromList`, already existed but had no
 *    caller anywhere in apps/mobile until now). Item names come from a new
 *    `fetchByIds(..., "products", ...)` lookup in this page's own data
 *    fetch (moved into the shared package as `loadListsPageData` 2026-08-20,
 *    see this file's own effect comment below for why),
 *    keyed by the UNION of every list's product ids in one request --
 *    same egress-saving shape `fetchListPriceLookups` already uses for
 *    prices on this same page, not a per-list or per-item fetch. Couldn't
 *    verify against the live Supabase schema this session (no DB access
 *    from this environment) that `lists`' RLS actually permits UPDATE --
 *    flagged on `updateListName` itself in lists.ts, worth a real rename
 *    attempt on Jay's own dev server to confirm before calling this done.
 *
 * UX audit follow-through, 2026-08-20 (Jay: "Ok proceed with these," after
 * a Lists-page UX review this same session flagged 3 concrete gaps --
 * "item rows are bare text, no image/price/verdict, unlike every other
 * product card in this app," "split view items from rename," "item tap
 * should open the deal page"). All 3 addressed together, since the first
 * (rich item cards) is also the mechanism the third (tap-through) comes
 * free from:
 *  - Item rows now render `ListItemProductCard` (a new, compact sibling of
 *    `ProductListCard.tsx` -- see that new file's own doc comment for why
 *    a separate component rather than a `ProductListCard` retrofit) with
 *    a real image/price/store/verdict badge, built by
 *    `buildListItemProductCard` (lists.ts) from the SAME
 *    `cheapestByProduct`/`dealByProductStore` lookups this page's own data
 *    fetch (`loadListsPageData`, lists.ts, since 2026-08-20) already fetched
 *    for the card-level summary badge/
 *    total -- no extra network round trip, just a wider `products` select
 *    (`id,name,brand` -> `+category,image_url,unit_size`). Falls back to
 *    the original plain-text row only for the rare item with no current
 *    price at all (delisted/no catalogue match).
 *  - Viewing a list's items is no longer tied to the pencil/rename control
 *    -- `isExpanded` (ListCard) is now independent state, toggled by the
 *    item-count line itself (now a real button with a chevron, not a
 *    plain `<p>`). The pencil still opens `isExpanded` too (entering
 *    rename without seeing the list's own items would be a regression),
 *    but it's no longer the ONLY way in.
 *  - Tap-through to `/deal/[id]/[store]` comes free from
 *    `ListItemProductCard` reusing `ProductListCard`'s own "whole card is
 *    a button" pattern -- nothing extra needed once real `ProductCard`/
 *    `CurrentDeal` data existed per item to link to.
 *
 * Items expanded by default, 2026-08-20 (cont., Jay: "The lists should be
 * expanded by default") -- `ListCard`'s `isExpanded` now starts `true`
 * instead of `false`; still fully toggleable per-card, just a different
 * initial value.
 *
 * Remove confirmation, 2026-08-20 (cont., Jay: "When selecting an X on a
 * product on a list, there should be a remove confirmation") -- an item's
 * X button no longer calls `onRemoveItem` on the first tap. Both item-row
 * shapes (`ListItemProductCard` for items with a real `ProductCard`,
 * `FallbackItemRow` just below `ListCard` for the rare item with no
 * current price) now carry their own local `confirmingRemove` state and
 * swap to an inline "Remove {name}?" + tick/cross prompt first, same
 * pattern `ListCard`'s own `confirmingDelete` already used for removing a
 * whole LIST -- see each component's own doc comment for the sizing
 * differences between the 3 (list-level, card-row, fallback-row).
 *
 * Data fetch cached, 2026-08-20 (cont., Jay: "Can we cache the lists in a
 * smart way? so they don't need to be loaded each time you select the
 * lists tab") -- this page's own composite fetch (lists + items + price
 * lookups + product meta + item cards, previously a page-local
 * `loadListsData` useCallback) moved verbatim into the shared package as
 * `loadListsPageData`, wrapped there in a per-user, 60s-TTL, invalidate-on-
 * write cache (same request-dedup shape `data.ts`'s own
 * `loadLiveProductsDeduped` already established for the specials catalogue)
 * -- see that function's own doc comment (lists.ts) for the full design and
 * why invalidation, not the TTL, is the real freshness mechanism. This page
 * mounts fresh every time the Lists tab is selected (client-side route
 * change, no persisted layout state), so before this change every single
 * visit paid for the full 4-round-trip fetch again even seconds after the
 * last one; a repeat visit within the cache's TTL now returns instantly
 * with no network call at all. `reload()` (used by create/delete/rename/
 * remove-item, all below) now invalidates this user's cache entry before
 * refetching, so this page's own writes always show immediately rather
 * than serving a pre-write cached result for up to 60s.
 */
export default function ListsPage() {
  const { user, isAnonymousSession, loading: authLoading, openAuthSheet } = useAuth();
  const [lists, setLists] = useState<ListRow[]>([]);
  const [itemsByList, setItemsByList] = useState<Map<string, ListItemRow[]>>(new Map());
  const [summaries, setSummaries] = useState<Map<string, ListSummary>>(new Map());
  // Product id -> catalogue meta, for the item list added 2026-08-15 (see
  // this file's own doc comment, "allow items removed"). Widened 2026-08-20
  // (UX audit, "item rows are bare text") from just `{ name, brand }` to
  // the full `ListItemProductMeta` shape (`category`/`image_url`/
  // `unit_size` added) -- `buildListItemProductCard` (lists.ts) needs all 5
  // fields to build a real `ProductCard`, not just enough for a plain-text
  // label.
  const [productMeta, setProductMeta] = useState<Map<string, ListItemProductMeta>>(new Map());
  // product_id -> a real ProductCard (image/price/verdict), built by
  // `buildListItemProductCard` for every item that has a current price.
  // Items with NO current price at all (delisted/no catalogue match) have
  // no entry here -- `ListCard` below falls back to a plain-text row for
  // those specific items, same as every item rendered before this change.
  const [itemCards, setItemCards] = useState<Map<string, ProductCardData>>(new Map());
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);
  // Create-list bottom sheet (2026-08-14, see this file's own doc comment
  // above). `createError` is deliberately separate from `error` above --
  // that one drives the page-level `ErrorState` banner, which sits behind
  // this sheet while it's open.
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [newlyCreatedListId, setNewlyCreatedListId] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(true);
  const [expandAllRequest, setExpandAllRequest] = useState(0);
  const [sortMode, setSortMode] = useState<"recent" | "savings">("recent");
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);

  // The actual composite fetch (fetch this user's lists, their items, price
  // lookups, product meta, and build item cards) moved out of this page
  // entirely and into the shared package's own `loadListsPageData`
  // (2026-08-20, per Jay: "Can we cache the lists in a smart way? so they
  // don't need to be loaded each time you select the lists tab") -- see
  // that function's own doc comment (lists.ts) for the full cache design.
  // This page mounting fresh every time the Lists tab is selected (a real
  // client-side route change, not a persisted layout) used to mean a full
  // 4-round-trip refetch on every single visit; `loadListsPageData` now
  // returns a cached, still-in-memory result for repeat visits within its
  // 60s TTL, with real invalidation (not just the TTL) firing right after
  // this page's own create/delete/rename/remove-item writes below AND from
  // `AddToListButton.tsx`'s own add/remove (different component, same
  // underlying `list_items` rows) -- so a stale read is either "this user's
  // own edit, already invalidated" or "under 60s old and nothing wrote to
  // it," never a visibly wrong item count/total.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Availability is external data and can change after the short list-page
    // cache is populated, so every page load gets a fresh price/special check.
    loadListsPageData(getSupabaseClient(), supabaseConfig, user.id, { forceRefresh: true })
      .then(({ rows, grouped, summaries, productMeta, itemCards }) => {
        if (cancelled) return;
        setLists(rows);
        setItemsByList(grouped);
        setSummaries(summaries);
        setProductMeta(productMeta);
        setItemCards(itemCards);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeFetchError(err, "Failed to load lists"));
      })
      .finally(() => {
        if (!cancelled) setLoadingLists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Used by the handlers below (not effects), so calling setState directly is
  // fine. Also the ErrorState retry action (2026-08-11) -- toggles
  // `loadingLists` still gates the initial empty state and tracks an active
  // fetch, but loading feedback stays out of the document flow so the cards
  // never move upward when the request completes.
  const reload = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (!user) return;
    if (showLoading) setLoadingLists(true);
    setError(null);
    // Invalidates BEFORE refetching (2026-08-20, see this file's own
    // top-of-file effect comment on `loadListsPageData`'s cache) -- without
    // this, a create/delete/rename/remove-item that happens well within the
    // 60s TTL would still be served the pre-write cached entry here, so the
    // user's own just-made edit wouldn't show up until the TTL expired.
    invalidateListsPageCache(user.id);
    try {
      const { rows, grouped, summaries, productMeta, itemCards } = await loadListsPageData(
        getSupabaseClient(),
        supabaseConfig,
        user.id
      );
      setLists(rows);
      setItemsByList(grouped);
      setSummaries(summaries);
      setProductMeta(productMeta);
      setItemCards(itemCards);
    } catch (err) {
      setError(describeFetchError(err, "Failed to load lists"));
    } finally {
      if (showLoading) setLoadingLists(false);
    }
  }, [user]);

  // AddToListButton invalidates the shared cache and broadcasts this event
  // after a successful add/remove. Refresh the already-mounted Lists page as
  // well, so returning to it is not required to see the new membership.
  useEffect(() => {
    if (!user) return;
    const handleMembershipChanged = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source === "lists-page") return;
      void reload({ showLoading: false });
    };
    window.addEventListener(LIST_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);
    return () => window.removeEventListener(LIST_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);
  }, [reload, user]);

  // Fake-login guard removed 2026-08-13 -- root cause of Jay's original
  // report (2026-08-11) was the dev-only "test account" having no real
  // Supabase JWT at all, so `lists`' INSERT policy (`WITH CHECK (auth.uid()
  // = user_id)`) always rejected it. That's no longer true: the test
  // account is a real Supabase anonymous sign-in as of 2026-08-13 (per
  // Jay's ask, once he reported "My List page - currently the user can't
  // create any lists. Even when logged in with the test account" -- see
  // auth-context.tsx's own doc comment for the full swap), so it has a
  // real `auth.uid()` and this insert (and delete, below) now succeeds for
  // it exactly like any other signed-in user. No guard needed here any
  // more -- `handleCreate`/`handleDelete` just run the real call directly.
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newListName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const createdList = await createList(getSupabaseClient(), user.id, newListName);
      setNewListName("");
      setIsCreateSheetOpen(false);
      setNewlyCreatedListId(createdList.id);
      await reload({ showLoading: false });
    } catch (err) {
      setCreateError(describeFetchError(err, "Failed to create list"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(listId: string) {
    setDeletingListId(listId);
    try {
      await deleteList(getSupabaseClient(), listId);
      window.dispatchEvent(new CustomEvent(LIST_MEMBERSHIP_CHANGED_EVENT, { detail: { source: "lists-page" } }));
      await reload({ showLoading: false });
    } catch (err) {
      setError(describeFetchError(err, "Failed to delete list"));
    } finally {
      setDeletingListId(null);
    }
  }

  // Deliberately does NOT catch -- `ListCard`'s own `saveName` catches this
  // and shows the error inline next to its edit field (same
  // separate-local-error pattern `createError`/the create-list sheet above
  // already uses), the same way a page-level `setError`/`ErrorState` banner
  // wouldn't be visible while a card's edit row is open, not because the
  // failure is any less real.
  async function handleRename(listId: string, name: string) {
    await updateListName(getSupabaseClient(), listId, name);
    await reload();
  }

  async function handleRemoveItem(listId: string, productId: string) {
    try {
      await removeItemFromList(getSupabaseClient(), listId, productId);
      window.dispatchEvent(new CustomEvent(LIST_MEMBERSHIP_CHANGED_EVENT, { detail: { source: "lists-page" } }));
      await reload();
    } catch (err) {
      setError(describeFetchError(err, "Failed to remove item"));
    }
  }

  if (authLoading) {
    return (
      <main className="flex flex-col gap-3 pb-8">
        <SearchBar
          variant="shadow"
          placeholder="Search items to add to your lists"
          sticky={false}
          backgroundClassName="page-paper-surface"
        />
      </main>
    );
  }

  // 2026-08-19, per Jay: "The login/sign up screen needs it's own dedicated
  // bottom sheet, and not live on the Lists page" -- this used to render
  // `AuthPanel` as the entire page (a full-page swap, not a real gate).
  // Same dashed-card empty-state pattern `page.tsx`'s signed-out
  // `MyListSection` already uses, with a "Log in" button that opens the new
  // global `AuthSheet` (`openAuthSheet`, auth-context.tsx) instead.
  if (!user) {
    return (
      <main className="flex flex-col gap-4 pt-6 pb-8">
        <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-center">
          <Image
            src="/lists-login.webp"
            alt="Dodgey mascot with an empty shopping list"
            width={482}
            height={512}
            sizes="144px"
            preload
            className="mascot-wave h-auto w-full max-w-[8.5rem]"
          />
          <p className="max-w-xs px-4 text-sm font-bold text-stone-700">Log in to create and save shopping lists.</p>
          <button
            type="button"
            onClick={() => openAuthSheet("Log in to create and save shopping lists.")}
            className="dd-btn dd-btn-primary cursor-pointer"
          >
            Log in or create an account
          </button>
        </div>
      </main>
    );
  }

  const sortedLists = [...lists].sort((a, b) => {
    if (sortMode === "savings") {
      return (summaries.get(b.id)?.savingsAmount ?? 0) - (summaries.get(a.id)?.savingsAmount ?? 0);
    }
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
  });

  return (
    <main className="flex min-h-full flex-col gap-4 pb-20">
      <SearchBar
        variant="shadow"
        placeholder="Search items to add to your lists"
        sticky={false}
        backgroundClassName="page-paper-surface"
      />

      <div className="flex items-center justify-between gap-2 px-5">
        <button
          type="button"
          onClick={() => {
            setExpandAll((expanded) => !expanded);
            setExpandAllRequest((request) => request + 1);
          }}
          disabled={loadingLists || lists.length === 0}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 dd-type-control text-stone-600 shadow-none transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {expandAll ? "Collapse all" : "Expand all"}
        </button>
        <button
          type="button"
          onClick={() => setIsSortSheetOpen(true)}
          disabled={loadingLists || lists.length === 0}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 dd-type-control text-stone-600 shadow-none transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>Sort by</span>
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {isAnonymousSession && (
        // Same amber "dev tool" language/styling as AuthPanel.tsx's own
        // test-account button, so the two read as one consistent test-mode
        // language rather than two different ad-hoc warnings. Copy updated
        // 2026-08-13 -- creating/deleting lists genuinely works now (see
        // `handleCreate`/`handleDelete`'s own comment above), so this no
        // longer claims otherwise; it just flags that this particular
        // account has no email attached to it.
        <div className="mx-5 flex flex-col gap-1 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="dd-type-meta dd-type-meta-strong text-amber-700">Test mode</p>
          <p className="text-[13px] leading-relaxed text-amber-700">
            You&rsquo;re using an anonymous test account — lists you create here really do save, but this account
            has no email attached, so you can&rsquo;t sign back into it from another device.
          </p>
        </div>
      )}

      {error && (
        // `reload()` is the same refetch handlers below already call after a
        // successful create/delete -- reused here as the retry action so a
        // failed load, create, or delete all recover the same way: re-sync
        // from the server rather than re-attempting the specific mutation
        // that failed (which `error` alone doesn't carry enough
        // information to safely redo).
        <ErrorState message="Something went wrong with your lists." detail={error} onRetry={() => reload()} />
      )}

      <div className={`relative ${loadingLists ? "min-h-[112px]" : ""}`}>
        <div className="pointer-events-none absolute inset-0 z-10">
          <LoadingMascot loading={loadingLists} />
        </div>

        {!loadingLists && lists.length === 0 && (
          <div className="mx-5 flex flex-col items-center gap-1.5 rounded-3xl border border-dashed border-stone-200 bg-white py-10 text-center">
            <Image
              src="/lists-login.webp"
              alt="Dodgey mascot with an empty shopping list"
              width={482}
              height={512}
              sizes="128px"
              className="mascot-wave mb-2 h-auto w-full max-w-[8rem]"
            />
            <p className="max-w-xs px-4 text-sm font-bold text-stone-700">No lists yet</p>
            <p className="max-w-xs px-4 dd-type-secondary text-stone-500">
              Tap the + button below, or tap the + on a Specials card to start one.
            </p>
          </div>
        )}

        {lists.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex flex-col gap-3 px-5"
          >
            {sortedLists.map((list) => (
              <ListCard
                key={`${list.id}-${expandAll ? "expanded" : "collapsed"}-${expandAllRequest}`}
                list={list}
                items={itemsByList.get(list.id) ?? []}
                summary={summaries.get(list.id)}
                productMeta={productMeta}
                itemCards={itemCards}
                onDelete={() => handleDelete(list.id)}
                onRename={(name) => handleRename(list.id, name)}
                onRemoveItem={(productId) => handleRemoveItem(list.id, productId)}
                onRefresh={reload}
                expandAll={expandAll}
                pricesLoading={loadingLists}
                isDeleting={deletingListId === list.id}
                isNew={newlyCreatedListId === list.id}
                onNewAnimationComplete={() => setNewlyCreatedListId(null)}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Create-list FAB (2026-08-14, see this file's own doc comment) --
          fixed bottom-right, same `mx-auto` capped-column trick every other
          fixed, full-viewport-by-default element in this app already needs
          (BottomNav.tsx's own doc comment has the full "why" -- without it
          this would stick to the real browser's right edge on a wide
          window, not the app's own mobile-emulation column). The
          `pointer-events-none` outer row + `pointer-events-auto` button is
          what lets that full-width row sit on top of page content without
          blocking clicks anywhere except the button itself. `.bottom-safe-fab`
          (globals.css) is one more `env(safe-area-inset-bottom)` offset in
          the same family as `.bottom-safe-nav`/`.pb-safe-nav`/`.pb-safe-sm`
          -- plain CSS, not a Tailwind arbitrary-value bracket class, for the
          same reason those are (see globals.css's own comment on that
          class): this app's Tailwind/Turbopack build has a real, reproduced
          bug mangling that exact `env()` pattern when it's a scanned
          bracket class sitting near multi-byte comment text. Positioned
          above BottomNav (same `z-40` tier as BottomNav itself, floating
          page chrome rather than a modal overlay) with enough clearance
          (see that CSS class) to never overlap it. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-safe-fab z-40 mx-auto flex w-full max-w-[480px] justify-end px-5">
        <button
          type="button"
          onClick={() => setIsCreateSheetOpen(true)}
          aria-label="Create a new list"
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg transition-colors hover:bg-ink-600"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      {/* Create-list bottom sheet -- same scrim + spring slide-up recipe as
          AppHeader.tsx's own account menu (that file's doc comment has the
          full recipe rationale), same z-50/z-[51] scrim/sheet tier too
          (opens from ordinary page chrome, not from inside another overlay
          -- see PageLoader.tsx's own doc comment for this app's full
          z-index ordering). Input/submit-button classes are lifted
          verbatim from the inline form this sheet replaces, so the create-
          list control itself looks identical to before, just relocated.

          `min-h-[45vh]` added 2026-08-14, per Jay: "The new list bottom
          sheet needs to use the default bottom sheet height so it's not
          too low on the screen" -- this sheet's only real content (a
          single input + submit button) is short enough that, without an
          explicit minimum, the sheet auto-sized to just that content and
          sat noticeably lower/shorter than every other sheet in the app.
          `min-h-[45vh]` is the same floor AppHeader.tsx's own account-menu
          sheet already uses -- the one other sheet in this app real enough
          to call a "default" -- so this now matches it instead of
          inventing its own shorter convention. */}
      <AnimatePresence>
        {isCreateSheetOpen && (
          <>
            <motion.div
              key="create-list-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setIsCreateSheetOpen(false);
                setCreateError(null);
              }}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
            />
            <motion.div
              key="create-list-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="dd-bottom-sheet fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
                {/* Bottom-sheet title style unified app-wide 2026-08-19 --
                    was a small tracking-widest text-stone-500 eyebrow label,
                    same as AppHeader's/AddToListButton's own sheet titles
                    used to be; now a real title, same class every bottom
                    sheet's top title uses (see app/page.tsx's Sort sheet for
                    the full cross-reference). `<h3>`, not `<span>`, to match. */}
                <h3 className="dd-type-sheet-title text-stone-900">New list</h3>
                <button
                  onClick={() => {
                    setIsCreateSheetOpen(false);
                    setCreateError(null);
                  }}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-3 px-5 py-4 pb-safe-sm">
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="List name"
                  autoFocus
                  disabled={creating}
                  className="rounded-xl border border-stone-300 px-4 py-2.5 text-base text-stone-700 placeholder:text-stone-500 focus:border-stone-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                />
                {createError && (
                  <p className="dd-type-meta dd-type-meta-strong text-alert-700">{createError}</p>
                )}
                <button
                  type="submit"
                  disabled={creating || !newListName.trim()}
                  className="dd-btn dd-btn-primary mt-auto mb-2 w-full cursor-pointer font-display"
                >
                  {creating ? "Creating…" : "Create list"}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BottomSheetPortal open={isSortSheetOpen}>
        <AnimatePresence>
          {isSortSheetOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close sort options"
                className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
                onClick={() => setIsSortSheetOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="lists-sort-title"
                className="dd-bottom-sheet fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[30vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white pb-safe-sm shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
              >
                <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
                  <h3 id="lists-sort-title" className="dd-type-sheet-title text-stone-900">Sort lists by</h3>
                  <button
                    type="button"
                    onClick={() => setIsSortSheetOpen(false)}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="py-2">
                  {([['recent', 'Most recent'], ['savings', 'Most savings']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setSortMode(value);
                        setIsSortSheetOpen(false);
                      }}
                      className="flex w-full items-center justify-between border-b border-stone-100 px-5 py-4 text-left dd-type-control text-stone-700 last:border-b-0 hover:bg-stone-50"
                    >
                      {label}
                      {sortMode === value && <Check className="h-5 w-5 text-ink-900" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>
    </main>
  );
}

function ListCard({
  list,
  items,
  summary,
  productMeta,
  itemCards,
  onDelete,
  onRename,
  onRemoveItem,
  onRefresh,
  expandAll,
  pricesLoading,
  isDeleting,
  isNew,
  onNewAnimationComplete,
}: {
  list: ListRow;
  items: ListItemRow[];
  summary: ListSummary | undefined;
  productMeta: Map<string, ListItemProductMeta>;
  itemCards: Map<string, ProductCardData>;
  onDelete: () => void;
  onRename: (name: string) => Promise<void>;
  onRemoveItem: (productId: string) => void;
  onRefresh: (options?: { showLoading?: boolean }) => void;
  expandAll: boolean;
  pricesLoading: boolean;
  isDeleting: boolean;
  isNew: boolean;
  onNewAnimationComplete: () => void;
}) {
  // Inline "are you sure?" state (2026-08-14, Jay: "create an are you sure?
  // state on the card incase the user doesn't want to delete the card") --
  // the trash icon used to call `onDelete` directly. Local to this card
  // (not lifted to the page) since only one card at a time needs it and
  // nothing outside this card cares whether it's showing.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const [deleteCardHeight, setDeleteCardHeight] = useState<number | null>(null);

  // Rename state (2026-08-15, "allow lists to be edited"), local to this
  // card same as `confirmingDelete` above -- only one card at a time needs
  // it and no sibling card or the page itself cares whether it's open.
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(list.name);
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  // View-items toggle -- split OUT from `isEditing` 2026-08-20 (UX audit,
  // Jay: "split view items from rename"). Before this, the item list only
  // ever showed alongside the rename input (`isEditing` gated both), so
  // "see what's in this list" and "rename this list" were the same tap on
  // the pencil icon -- two unrelated actions sharing one entry point, with
  // no way to just browse a list's items without also opening its name for
  // editing. Now independent: this toggles via the item-count summary line
  // below (a real `<button>`, not the whole card -- keeps hit-targets
  // predictable and doesn't fight the pencil/trash icon buttons or,
  // post-audit, `ListItemProductCard`'s own tap-to-deal-page rows nested
  // inside once expanded), `isEditing` toggles only via the pencil icon
  // exactly as before. Expanding also happens automatically when entering
  // edit mode (see `startEditing` below) -- editing a list without seeing
  // what's actually in it first would be a regression, not an
  // improvement, so that one path from the old combined behavior is kept.
  // Defaults to `true` (2026-08-20 (cont.), per Jay: "The lists should be
  // expanded by default") -- was `false` (collapsed on first render, every
  // card required an explicit tap to reveal its own items). Still fully
  // toggleable per-card same as before; this only changes the initial
  // value each `ListCard` instance's own `useState` starts at, not
  // anything about how the toggle itself behaves.
  const [isExpanded, setIsExpanded] = useState(expandAll);
  const itemCount = items.length;
  const liveItems = items.filter((item) => itemCards.get(item.product_id)?.currentDeals[0]?.isOnSpecial === true);
  const notOnSpecialItems = items.filter((item) => !liveItems.includes(item));

  function enterDeleteMode() {
    setDeleteCardHeight(cardRef.current?.offsetHeight ?? null);
    setConfirmingDelete(true);
  }

  async function saveName() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === list.name) {
      // Empty or unchanged -- close without a wasted round trip, same as
      // the create-list form's own `disabled={!newListName.trim()}` guard
      // just further up this file, just without disabling the button
      // outright (Enter/blur should always be able to close this row).
      setIsEditing(false);
      setEditName(list.name);
      setRenameError(null);
      return;
    }
    setSavingName(true);
    setRenameError(null);
    try {
      await onRename(trimmed);
      setIsEditing(false);
    } catch (err) {
      setRenameError(describeFetchError(err, "Failed to rename list"));
    } finally {
      setSavingName(false);
    }
  }

  return (
    // `shadow-sm` instead of `border border-stone-200` (2026-08-15, Jay:
    // "no border line, but instead a short drop shadow (subtle)"). Delete
    // state swaps the fill to `bg-alert-50` too, so the card itself reads
    // as "in a destructive state," not just its confirm buttons.
    <motion.article
      ref={cardRef}
      style={{
        ...(confirmingDelete && deleteCardHeight ? { height: deleteCardHeight } : {}),
        touchAction: "pan-y",
      }}
      initial={isNew ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      onAnimationComplete={isNew ? onNewAnimationComplete : undefined}
      drag={confirmingDelete ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={(_event, info) => {
        if (info.offset.x < -70) enterDeleteMode();
      }}
      aria-busy={isDeleting}
      className={`relative flex flex-col gap-2 overflow-hidden rounded-2xl p-4 shadow-sm ${confirmingDelete ? "bg-alert-50" : "bg-white"}`}
    >
      {confirmingDelete ? (
        // Whole-card delete state (2026-08-15, Jay: "make the whole card
        // change to the delete state, and make the Delete text - tick and
        // cross larger and centred") -- replaces every other row below
        // (name, badges, price, best-store chip) rather than just growing
        // the old top-right tick/cross pair in place, and the two controls
        // are now `h-12 w-12` circles with `h-6 w-6` icons (was `h-6 w-6`/
        // `h-3.5 w-3.5`).
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-3 text-center">
          <span className="dd-type-control text-alert-700">Delete “{list.name}”?</span>
          <div className="flex items-center gap-5">
            <button
              onClick={onDelete}
              aria-label={`Confirm delete ${list.name}`}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-alert-600 text-white transition-colors hover:bg-alert-700"
            >
              <Check className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              aria-label="Cancel delete"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm transition-colors hover:text-stone-700"
            >
              <X className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            {isEditing ? (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setIsEditing(false);
                      setEditName(list.name);
                      setRenameError(null);
                    }
                  }}
                  autoFocus
                  disabled={savingName}
                  aria-label="List name"
                  className="w-full max-w-[210px] flex-none rounded-lg border border-stone-300 px-2.5 py-1 text-base font-bold text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                />
                <div className="flex shrink-0 items-center gap-2">
                  <button
                  onClick={saveName}
                  disabled={savingName || !editName.trim()}
                  aria-label="Save list name"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fair-700 transition-colors hover:bg-fair-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(list.name);
                    setRenameError(null);
                  }}
                  // Disabled while `savingName` (peer review catch,
                  // 2026-08-15) -- `saveName()`'s `await onRename(...)` isn't
                  // abortable, so clicking Cancel while a save is still in
                  // flight used to leave edit mode immediately while that
                  // save kept running underneath; if it later succeeded the
                  // rename landed anyway despite the "cancel," and if it
                  // failed `renameError` had nowhere sensible left to render.
                  // Disabling Cancel here matches Save's own
                  // `disabled={savingName || ...}` just above -- once a save
                  // is in flight, the only way out of this row is waiting
                  // for it to resolve, not backing out from under it.
                  disabled={savingName}
                  aria-label="Cancel rename"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <h2 className="text-base font-bold text-stone-900">{list.name}</h2>
            )}
            {!isEditing && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => {
                    setEditName(list.name);
                    // Clears any error left over from a previous edit
                    // session (peer review catch, 2026-08-15) -- without
                    // this, a failed rename's error message reopened along
                    // with the edit row on the NEXT pencil tap, before any
                    // new save had even been attempted.
                    setRenameError(null);
                    setIsEditing(true);
                    // Also expands the item list (2026-08-20, UX audit) --
                    // `isExpanded` is independent of `isEditing` now (see
                    // that state's own comment above), but entering rename
                    // without also seeing the list's own items would be a
                    // regression from the old combined pencil-does-both
                    // behavior, not an improvement.
                    setIsExpanded(true);
                  }}
                  aria-label={`Edit ${list.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {renameError && <p className="dd-type-meta dd-type-meta-strong text-alert-700">{renameError}</p>}

          {itemCount === 0 ? (
            <p className="dd-type-secondary text-stone-500">
              Empty — add items from Specials.
            </p>
          ) : (
            <>
              {/* Keep the item count and total as the leading text in the
                  summary row, followed immediately by the savings badge.
                  The row remains a single button so it still controls the
                  expand/collapse interaction while keeping the chevron at
                  the far right. */}
              <button
                type="button"
                onClick={() => setIsExpanded((e) => !e)}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Hide" : "Show"} items in ${list.name}`}
                className="flex w-full min-w-0 items-center gap-2 text-left text-sm text-stone-600 transition-colors hover:text-stone-900"
              >
                <span className="min-w-0 truncate">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                  {summary?.totalPrice != null && (
                    <>
                      {" "}
                      · <span className="font-semibold text-stone-900">${summary.totalPrice.toFixed(2)}</span>
                    </>
                  )}
                </span>
                {pricesLoading ? (
                  <span className="dd-badge dd-badge-neutral shrink-0">Checking prices…</span>
                ) : summary?.hasSavingsData && summary.savingsAmount > 0 ? (
                  <span className="dd-badge dd-badge-fair shrink-0">
                    -${summary.savingsAmount.toFixed(2)} saved
                  </span>
                ) : (
                  null
                )}
                <ChevronDown
                  className={`ml-auto h-5 w-5 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {summary?.bestPriceStore && (
                <span className="dd-badge dd-badge-neutral w-fit">
                  <Store className="h-3.5 w-3.5" aria-hidden="true" />
                  Best at {summary.bestPriceStore.store} — ${summary.bestPriceStore.total.toFixed(2)}
                </span>
              )}

            </>
          )}

          <AnimatePresence initial={false}>
            {isExpanded && itemCount > 0 && (
            // Item list -- own toggle now, independent of `isEditing` (see
            // `isExpanded`'s own comment above this component for the full
            // "why"). Each item renders `ListItemProductCard` (image/price/
            // verdict badge, tap-through to `/deal/[id]/[store]`) when
            // `itemCards` has a real ProductCard for it -- i.e. the product
            // currently has a price -- falling back to the original plain-
            // text row (name + remove button, no price/image) for the rare
            // item with no current price at all (delisted/no catalogue
            // match), same as `buildListItemProductCard`'s own "excluded,
            // not fabricated" contract (lists.ts).
              <motion.div
                key="list-items"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-1 flex flex-col gap-1.5 border-t border-stone-100 pt-2">
              {liveItems.map((item) => {
                const card = itemCards.get(item.product_id);
                const meta = productMeta.get(item.product_id);
                const label = meta?.name ?? "Item";
                const removeLabel = `Remove ${label} from ${list.name}`;

                if (card) {
                  return (
                    <ListItemProductCard
                      key={item.id}
                      product={card}
                      deal={card.currentDeals[0]}
                      quantity={item.quantity}
                      onRemove={() => onRemoveItem(item.product_id)}
                      removeLabel={removeLabel}
                      onAfterNotOnSpecial={() => onRefresh({ showLoading: false })}
                    />
                  );
                }
                return (
                  <FallbackItemRow
                    key={item.id}
                    label={label}
                    quantity={item.quantity}
                    removeLabel={removeLabel}
                    onRemove={() => onRemoveItem(item.product_id)}
                  />
                );
              })}
              {notOnSpecialItems.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5 border-t border-stone-100 pt-3">
                  <h3 className="dd-type-meta dd-type-meta-strong text-stone-500">Not on special</h3>
                  {notOnSpecialItems.map((item) => {
                    const card = itemCards.get(item.product_id);
                    const meta = productMeta.get(item.product_id);
                    const label = meta?.name ?? "Item";
                    const removeLabel = `Remove ${label} from ${list.name}`;

                    if (card) {
                      return (
                        <ListItemProductCard
                          key={item.id}
                          product={card}
                          deal={card.currentDeals[0]}
                          quantity={item.quantity}
                          onRemove={() => onRemoveItem(item.product_id)}
                          removeLabel={removeLabel}
                          onAfterNotOnSpecial={() => onRefresh({ showLoading: false })}
                        />
                      );
                    }
                    return (
                      <FallbackItemRow
                        key={item.id}
                        label={label}
                        quantity={item.quantity}
                        removeLabel={removeLabel}
                        onRemove={() => onRemoveItem(item.product_id)}
                      />
                    );
                  })}
                </div>
              )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.article>
  );
}

/**
 * Plain-text fallback for the rare list item with NO current price at all
 * (delisted/no catalogue match -- `buildListItemProductCard`, lists.ts,
 * returns `null` for these rather than a card with a fabricated price; see
 * this file's own `isExpanded` item-list block above for the full
 * card-vs-fallback split). Pulled out of that block's `.map()` into its own
 * component 2026-08-20 (per Jay: "When selecting an X on a product on a
 * list, there should be a remove confirmation") specifically so this row
 * can carry its own `confirmingRemove` state -- `ListCard` maps over
 * several items at once, so a single boolean at that level couldn't tell
 * which row was mid-confirm. Same inline "are you sure?" pattern
 * `ListItemProductCard.tsx`'s own `confirmingRemove` uses (that file's own
 * doc comment has the fuller "why"), scaled down further to fit this
 * row's own smaller, image-less footprint (`h-6 w-6`/`h-3.5 w-3.5` tick/
 * cross, vs. that component's `h-8 w-8`/`h-4 w-4`).
 *
 * Trigger switched from a tap on a trailing X icon to a swipe-left
 * gesture, same day (cont., per Jay: "to remove an item from a list, use
 * the swipe left gesture, then give the remove warning, keep the card the
 * same size in the warning") -- same `motion.div` `drag="x"` +
 * `dragConstraints={{left:0,right:0}}` + `dragElastic` rubber-band pattern
 * `ListItemProductCard.tsx` now uses, with the same numeric threshold (not
 * a shared import -- a single local `px` constant per file didn't seem
 * worth an extra cross-file export), and the same "one box, children swap,
 * size can't differ by construction" fix for "keep the card the same
 * size" -- see that file's own top-of-file doc comment for the full
 * design/tradeoff writeup (incl. the flagged accessibility gap: no
 * non-drag path left to trigger removal). This row's own normal-state box
 * widened `px-1` -> `px-2 py-1` (unioned with the confirm state's own box,
 * which already used that) so both states now share one identical class
 * string instead of two that merely happened to be close in size.
 */
// Matches ListItemProductCard.tsx's own SWIPE_THRESHOLD value -- see this
// component's own doc comment just above for why it's a separate local
// constant rather than a shared import.
const SWIPE_THRESHOLD = 70;

function FallbackItemRow({
  label,
  quantity,
  removeLabel,
  onRemove,
}: {
  label: string;
  quantity: number;
  removeLabel: string;
  onRemove: () => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  return (
    <motion.div
      drag={confirmingRemove ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={(_event, info) => {
        if (info.offset.x < -SWIPE_THRESHOLD) setConfirmingRemove(true);
      }}
      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${confirmingRemove ? "bg-alert-50" : "grayscale opacity-60"}`}
      style={{ touchAction: "pan-y" }}
    >
      {confirmingRemove ? (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] leading-4 font-bold text-alert-700">
            Remove {label}?
          </span>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={onRemove}
              aria-label={`Confirm ${removeLabel}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-alert-600 text-white transition-colors hover:bg-alert-700"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            </button>
            <button
              onClick={() => setConfirmingRemove(false)}
              aria-label="Cancel remove"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-stone-500 shadow-xs transition-colors hover:text-stone-700"
            >
              <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            </button>
          </div>
        </>
      ) : (
        <span className="min-w-0 truncate text-[13px] leading-4 font-medium text-stone-600">
          {label}
          {quantity > 1 ? ` ×${quantity}` : ""}
        </span>
      )}
    </motion.div>
  );
}
