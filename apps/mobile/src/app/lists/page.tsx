"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, ShieldCheck, Store } from "lucide-react";
import {
  fetchUserLists,
  createList,
  deleteList,
  fetchItemsForLists,
  fetchListPriceLookups,
  computeListSummaryFromLookups,
  type ListRow,
  type ListItemRow,
  type ListSummary,
} from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import { supabaseConfig } from "@/lib/config";
import AuthPanel from "@/components/AuthPanel";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";

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
 */
export default function ListsPage() {
  const { user, isFakeSession, loading: authLoading, signOut } = useAuth();
  const [lists, setLists] = useState<ListRow[]>([]);
  const [itemsByList, setItemsByList] = useState<Map<string, ListItemRow[]>>(new Map());
  const [summaries, setSummaries] = useState<Map<string, ListSummary>>(new Map());
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);

  // Pure data fetch -- no setState inside. Kept separate from the effect and
  // handlers below on purpose: react-hooks' set-state-in-effect rule flags
  // ANY function invoked from an effect body if that function (even
  // transitively) calls a state setter, so the effect below applies state
  // itself via inline .then()/.catch() (mirrors specials/page.tsx's existing
  // pattern) instead of delegating to a helper that sets state.
  const loadListsData = useCallback(async () => {
    const client = getSupabaseClient();
    const rows = await fetchUserLists(client);

    const items = await fetchItemsForLists(client, rows.map((l) => l.id));
    const grouped = new Map<string, ListItemRow[]>();
    for (const item of items) {
      if (!grouped.has(item.list_id)) grouped.set(item.list_id, []);
      grouped.get(item.list_id)!.push(item);
    }

    // Egress pass (2026-08-08): one current_prices/dodgy_deals fetch for the
    // UNION of every list's product ids, not one fetch per list --
    // previously a user with several lists sharing even one product paid
    // for that product's rows N times over. computeListSummaryFromLookups
    // is pure (no network calls), so building each list's summary from the
    // shared lookups below costs nothing extra per list.
    const lookups = await fetchListPriceLookups(supabaseConfig, items.map((i) => i.product_id));
    const summaries = new Map<string, ListSummary>(
      rows.map((list) => [list.id, computeListSummaryFromLookups(grouped.get(list.id) ?? [], lookups)])
    );

    return { rows, grouped, summaries };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadListsData()
      .then(({ rows, grouped, summaries }) => {
        if (cancelled) return;
        setLists(rows);
        setItemsByList(grouped);
        setSummaries(summaries);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load lists");
      })
      .finally(() => {
        if (!cancelled) setLoadingLists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, loadListsData]);

  // Used by the handlers below (not effects), so calling setState directly is
  // fine. Also the ErrorState retry action (2026-08-11) -- toggles
  // `loadingLists` around the fetch (caught in peer review: without this,
  // Try Again refetched correctly but left the error card sitting there
  // motionless with no feedback, unlike every other retry added this
  // session) so `LoadingMascot` reappears the same way it does on the
  // initial load, for create/delete's own reload() calls too, not just retry.
  async function reload() {
    setLoadingLists(true);
    setError(null);
    try {
      const { rows, grouped, summaries } = await loadListsData();
      setLists(rows);
      setItemsByList(grouped);
      setSummaries(summaries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lists");
    } finally {
      setLoadingLists(false);
    }
  }

  // Fake-login guard (2026-08-11, root cause of Jay's reported
  // `createList: new row violates row-level security policy for table
  // "lists"`): `isFakeSession` (auth-context.tsx) never touches the real
  // Supabase client's session -- there's no real JWT, so `lists`' INSERT
  // policy (`WITH CHECK (auth.uid() = user_id)`, confirmed live via
  // `execute_sql`, correct and unchanged) always rejects it, since an
  // unauthenticated request has no `auth.uid()` at all to match. That's
  // long-documented, working-as-designed behavior for reads (fetchUserLists
  // silently returns zero rows under RLS, no error) -- but writes throw a
  // real Postgres error instead of failing quietly, and this screen let that
  // raw RLS message reach Jay rather than the friendly "test mode" framing
  // every other fake-session-aware surface (AppHeader's banner,
  // AuthPanel's own button) already uses. Short-circuits before the network
  // call entirely (not just after a failure) since it can never succeed;
  // the Create/Delete buttons below are also disabled outright so the
  // no-op path isn't reachable by mistake.
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newListName.trim() || isFakeSession) return;
    setCreating(true);
    setError(null);
    try {
      await createList(getSupabaseClient(), user.id, newListName);
      setNewListName("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(listId: string) {
    if (isFakeSession) return;
    try {
      await deleteList(getSupabaseClient(), listId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete list");
    }
  }

  if (authLoading) {
    return (
      <main className="flex flex-col gap-3 px-5 py-8">
        <h1 className="text-2xl font-extrabold text-stone-900">Lists</h1>
        <p className="text-sm text-stone-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex flex-col gap-4 px-5 py-8">
        <h1 className="text-2xl font-extrabold text-stone-900">Lists</h1>
        <AuthPanel prompt="Log in to create and save shopping lists." />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 pb-6">
      <header className="flex items-center justify-between px-5 pt-6">
        <h1 className="text-2xl font-extrabold text-stone-900">My Lists</h1>
        <button
          onClick={() => signOut()}
          className="cursor-pointer text-xs font-black uppercase tracking-wider text-alert-600 transition-colors hover:text-alert-700"
        >
          Log Out
        </button>
      </header>

      {isFakeSession && (
        // Same amber "dev tool" language/styling as AuthPanel.tsx's own
        // fake-login button, so the two read as one consistent test-mode
        // language rather than two different ad-hoc warnings.
        <div className="mx-5 flex flex-col gap-1 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Test Mode</p>
          <p className="text-xs leading-relaxed text-amber-700">
            This is a simulated login for design testing, not a real account — creating or deleting lists is
            disabled here since there&rsquo;s no real account for it to save to.
          </p>
        </div>
      )}

      <form onSubmit={handleCreate} className="flex gap-2 px-5">
        <input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="New list name"
          disabled={isFakeSession}
          className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-ink-200 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400"
        />
        <button
          type="submit"
          disabled={creating || !newListName.trim() || isFakeSession}
          className="shrink-0 cursor-pointer rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create New List"}
        </button>
      </form>

      {error && (
        // `reload()` is the same refetch handlers below already call after a
        // successful create/delete -- reused here as the retry action so a
        // failed load, create, or delete all recover the same way: re-sync
        // from the server rather than re-attempting the specific mutation
        // that failed (which `error` alone doesn't carry enough
        // information to safely redo).
        <ErrorState message="Something went wrong with your lists." detail={error} onRetry={() => reload()} />
      )}

      <LoadingMascot loading={loadingLists} label="Loading your lists…" />

      {!loadingLists && lists.length === 0 && (
        <div className="mx-5 flex flex-col items-center gap-1.5 rounded-3xl border border-dashed border-stone-200 bg-white py-10 text-center">
          <p className="max-w-xs px-4 text-sm font-bold text-stone-700">No lists yet</p>
          <p className="max-w-xs px-4 text-xs text-stone-500">
            Create one above, or tap the + on a Specials card to start one.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 px-5">
        {lists.map((list) => (
          <ListCard
            key={list.id}
            list={list}
            itemCount={itemsByList.get(list.id)?.length ?? 0}
            summary={summaries.get(list.id)}
            onDelete={() => handleDelete(list.id)}
          />
        ))}
      </div>
    </main>
  );
}

function ListCard({
  list,
  itemCount,
  summary,
  onDelete,
}: {
  list: ListRow;
  itemCount: number;
  summary: ListSummary | undefined;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-bold text-stone-900">{list.name}</h2>
        <button
          onClick={onDelete}
          aria-label={`Delete ${list.name}`}
          className="shrink-0 text-stone-400 hover:text-stone-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {itemCount === 0 ? (
        <p className="text-xs text-stone-500">
          Empty — add items from Specials.
        </p>
      ) : !summary ? (
        <p className="text-xs text-stone-500">Checking prices…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {summary.hasSavingsData && summary.savingsAmount > 0 ? (
              <span className="rounded-full bg-fair-600 px-2.5 py-1 text-[11px] font-bold text-white">
                -${summary.savingsAmount.toFixed(2)} SAVED
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-500">
                CHECKING PRICES…
              </span>
            )}
            {summary.hasVerifiedSpecial && (
              <span className="flex items-center gap-1 rounded-full bg-fair-600 px-2.5 py-1 text-[11px] font-bold text-white">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Verified Special
              </span>
            )}
          </div>

          <p className="text-sm text-stone-600">
            {itemCount} item{itemCount === 1 ? "" : "s"}
            {summary.totalPrice != null && (
              <>
                {" "}
                · <span className="font-semibold text-stone-900">${summary.totalPrice.toFixed(2)}</span>
              </>
            )}
          </p>

          {summary.bestPriceStore && (
            <span className="flex w-fit items-center gap-1 rounded-full border border-stone-200 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
              <Store className="h-3 w-3" aria-hidden="true" />
              Best at {summary.bestPriceStore.store} — ${summary.bestPriceStore.total.toFixed(2)}
            </span>
          )}
        </>
      )}
    </article>
  );
}
