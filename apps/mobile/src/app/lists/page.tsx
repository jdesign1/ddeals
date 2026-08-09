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
 */
export default function ListsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
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

  // Used by the handlers below (not effects), so calling setState directly is fine.
  async function reload() {
    try {
      const { rows, grouped, summaries } = await loadListsData();
      setLists(rows);
      setItemsByList(grouped);
      setSummaries(summaries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lists");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newListName.trim()) return;
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
        <button onClick={() => signOut()} className="text-xs font-semibold text-stone-500 underline">
          Log out
        </button>
      </header>

      <form onSubmit={handleCreate} className="flex gap-2 px-5">
        <input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="New list name"
          className="flex-1 rounded-full border border-stone-300 px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={creating || !newListName.trim()}
          className="shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-brand-primary)" }}
        >
          {creating ? "Creating…" : "Create New List"}
        </button>
      </form>

      {error && (
        <p className="px-5 text-sm" style={{ color: "var(--color-brand-error)" }}>
          {error}
        </p>
      )}

      <LoadingMascot loading={loadingLists} label="Loading your lists…" />

      {!loadingLists && lists.length === 0 && (
        <p className="px-5 text-sm text-stone-500">
          No lists yet — create one above, or tap the + on a Specials card to start one.
        </p>
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
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                style={{ backgroundColor: "var(--color-brand-primary)" }}
              >
                -${summary.savingsAmount.toFixed(2)} SAVED
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-500">
                CHECKING PRICES…
              </span>
            )}
            {summary.hasVerifiedSpecial && (
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                style={{ backgroundColor: "var(--color-verdict-real-saver)" }}
              >
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
