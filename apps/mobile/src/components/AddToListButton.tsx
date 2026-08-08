"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Check } from "lucide-react";
import { fetchUserLists, addItemToList, type ListRow } from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseClient } from "@/lib/supabase-client";

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
 */
export default function AddToListButton({ productId }: { productId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    if (user && lists === null) {
      try {
        const rows = await fetchUserLists(getSupabaseClient());
        setLists(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lists");
      }
    }
  }

  async function handleAdd(listId: string) {
    try {
      await addItemToList(getSupabaseClient(), listId, productId);
      setAddedTo((prev) => new Set(prev).add(listId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    }
  }

  return (
    <div ref={containerRef} className="absolute right-2 top-2 z-10">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) setOpen(false);
          else handleOpen();
        }}
        aria-label="Add to list"
        className="flex h-7 w-7 items-center justify-center rounded-full text-white shadow"
        style={{ backgroundColor: "var(--color-brand-primary)" }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-9 w-44 rounded-xl border border-stone-200 bg-white p-2 shadow-lg"
        >
          {!user ? (
            <Link
              href="/lists"
              className="block rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-700"
            >
              Log in to save items
            </Link>
          ) : lists === null ? (
            <p className="px-2 py-1.5 text-xs text-stone-500">Loading…</p>
          ) : lists.length === 0 ? (
            <Link href="/lists" className="block rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-700">
              Create a list first
            </Link>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {lists.map((list) => (
                <li key={list.id}>
                  <button
                    onClick={() => handleAdd(list.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    <span className="truncate">{list.name}</span>
                    {addedTo.has(list.id) && (
                      <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-brand-primary)" }} aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="px-2 pt-1 text-[10px]" style={{ color: "var(--color-brand-error)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
