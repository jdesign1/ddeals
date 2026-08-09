"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadLiveProducts, type ProductCard } from "@dodgey-deals/shared";
import { supabaseConfig } from "./config";

/**
 * Global full-screen search state (2026-08-09, per Jay's ask: "clicking the
 * search bar from home or any other screen should enter full search
 * screen"). Previously `isSearchActive`/`searchInput`/the live `products`
 * fetch all lived as local state inside `page.tsx` (Home), so
 * `FullScreenSearch`/`ScannerModal` could only be opened from Home --
 * navigating to `/specials`, `/lists`, or `/me` had no way to reach them at
 * all. Lifted here, mounted once in `layout.tsx` (same pattern as
 * `HeaderOverrideProvider`/`AuthProvider`), so any screen's header can open
 * the same overlay.
 *
 * `products`/`loadingProducts`/`error` now load exactly once here instead
 * of once per mount site -- Home used to run its own `loadLiveProducts`
 * call independently of this; consolidating to one call site is strictly
 * better for the egress-consciousness this project has been deliberate
 * about elsewhere (see project.md's "Diagnosed and fixed a Supabase egress
 * source" session), not just a refactor convenience. `loadLiveProducts`
 * already has its own two-layer cache (IndexedDB + in-memory dedup, see
 * `packages/shared/src/data.ts`), so this doesn't change *what* gets
 * fetched, just collapses what used to be (at minimum) Home's own fetch
 * plus whatever a second mount site would have added into a single one.
 */

interface SearchContextValue {
  products: ProductCard[];
  loadingProducts: boolean;
  error: string | null;
  query: string;
  setQuery: (value: string) => void;
  isActive: boolean;
  /** Opens the full-screen overlay without touching the query -- ported
   * from Prototype/index.html's `onFocus={() => setIsSearchActive(true)}`. */
  openSearch: () => void;
  /** Back arrow / dedicated close button -- clears the query AND exits,
   * same as the prototype's `handleClearSearch`. */
  closeSearch: () => void;
  isScannerOpen: boolean;
  openScanner: () => void;
  closeScanner: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

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
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SearchContextValue>(
    () => ({
      products,
      loadingProducts,
      error,
      query,
      setQuery,
      isActive,
      openSearch: () => setIsActive(true),
      closeSearch: () => {
        setQuery("");
        setIsActive(false);
      },
      isScannerOpen,
      openScanner: () => setIsScannerOpen(true),
      closeScanner: () => setIsScannerOpen(false),
    }),
    [products, loadingProducts, error, query, isActive, isScannerOpen]
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within a SearchProvider");
  return ctx;
}
