"use client";

import { useEffect, useMemo, useState } from "react";
import { ScanBarcode } from "lucide-react";
import {
  loadLiveProducts,
  normalizeStoreKey,
  storeMatchesFilter,
  STORE_DISPLAY_FALLBACK,
  type ProductCard,
  type CurrentDeal,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";
import DealCard from "@/components/DealCard";
import FilterPill from "@/components/FilterPill";

/**
 * S8 — Latest Specials Browse, per project.md's Stitch screen inventory.
 * Grid of specials from all stores, filter pills, TRUE SPECIAL / DODGY DEAL
 * badges. First fully live-data screen ported into apps/mobile — see
 * project.md's "IMPORTANT ACTIVE PLAN — Native iOS/Android App" for status.
 *
 * Deliberate simplifications vs. the Stitch mock, flagged here rather than
 * faked: per-card "+" add-to-list FAB now wired (2026-08-08, once S1/lists
 * existed — see AddToListButton.tsx) but no bottom "$X this week — View
 * List" savings bar yet (needs a cross-list "this week" aggregate, not
 * built).
 *
 * Each card here is one (product, store) deal, not a merged cross-store
 * product card — matches the Stitch design's store-filterable single-deal
 * cards ("Filter pills: All Stores / New World / Countdown / Pak'nSave").
 */

interface FlatDeal {
  product: ProductCard;
  deal: CurrentDeal;
}

const STORE_PILL_ORDER = ["newworld", "paknsave", "woolworths", "foursquare", "supervalue"];

export default function SpecialsPage() {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    loadLiveProducts(supabaseConfig)
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load specials");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flatDeals = useMemo<FlatDeal[]>(() => {
    const all: FlatDeal[] = [];
    for (const product of products) {
      for (const deal of product.currentDeals) {
        all.push({ product, deal });
      }
    }
    return all.sort((a, b) => b.deal.discountPercentage - a.deal.discountPercentage);
  }, [products]);

  const availableStoreKeys = useMemo(() => {
    const present = new Set(flatDeals.map((d) => normalizeStoreKey(d.deal.store)));
    return STORE_PILL_ORDER.filter((key) => present.has(key));
  }, [flatDeals]);

  const filteredDeals = useMemo(
    () => flatDeals.filter(({ deal }) => storeMatchesFilter(deal.store, storeFilter)),
    [flatDeals, storeFilter]
  );

  return (
    <main className="flex flex-col gap-4 pb-6">
      <header className="flex items-center justify-between px-5 pt-6">
        <h1 className="text-2xl font-extrabold text-stone-900">Specials</h1>
        <ScanBarcode className="h-5 w-5 text-stone-500" aria-hidden="true" />
      </header>

      <div className="flex gap-2 overflow-x-auto px-5 pb-1">
        <FilterPill label="All Stores" active={storeFilter === "all"} onClick={() => setStoreFilter("all")} />
        {availableStoreKeys.map((key) => (
          <FilterPill
            key={key}
            label={displayNameForKey(key)}
            active={storeFilter === key}
            onClick={() => setStoreFilter(key)}
          />
        ))}
      </div>

      {loading && <p className="px-5 text-sm text-stone-500">Loading specials…</p>}
      {error && (
        <p className="px-5 text-sm" style={{ color: "var(--color-brand-error)" }}>
          {error}
        </p>
      )}

      {!loading && !error && filteredDeals.length === 0 && (
        <p className="px-5 text-sm text-stone-500">
          {storeFilter === "all"
            ? "No specials found right now."
            : "No specials found for this store right now."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 px-5">
        {filteredDeals.map(({ product, deal }) => (
          <DealCard key={`${product.id}-${deal.store}`} product={product} deal={deal} />
        ))}
      </div>
    </main>
  );
}

function displayNameForKey(key: string): string {
  return STORE_DISPLAY_FALLBACK[key] || key;
}
