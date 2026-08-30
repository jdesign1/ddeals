"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CardLayout = "single" | "grid";

const CARD_LAYOUT_STORAGE_KEY = "dodgey-deals-card-layout";

interface CardLayoutContextValue {
  cardLayout: CardLayout;
  isGridLayout: boolean;
  setCardLayout: (layout: CardLayout) => void;
}

const CardLayoutContext = createContext<CardLayoutContextValue | null>(null);

export function CardLayoutProvider({ children }: { children: ReactNode }) {
  // Single-column is the SSR-safe default and preserves the current layout
  // until a saved preference is read in the browser.
  const [cardLayout, setCardLayoutState] = useState<CardLayout>("single");

  useEffect(() => {
    try {
      const savedLayout = window.localStorage.getItem(CARD_LAYOUT_STORAGE_KEY);
      if (savedLayout === "single" || savedLayout === "grid") setCardLayoutState(savedLayout);
    } catch {
      // Storage can be unavailable in private browsing; the default remains usable.
    }
  }, []);

  const setCardLayout = useCallback((layout: CardLayout) => {
    setCardLayoutState(layout);
    try {
      window.localStorage.setItem(CARD_LAYOUT_STORAGE_KEY, layout);
    } catch {
      // Keep the in-memory preference even when persistent storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ cardLayout, isGridLayout: cardLayout === "grid", setCardLayout }),
    [cardLayout, setCardLayout]
  );

  return <CardLayoutContext.Provider value={value}>{children}</CardLayoutContext.Provider>;
}

export function useCardLayout() {
  const context = useContext(CardLayoutContext);
  if (!context) throw new Error("useCardLayout must be used within a CardLayoutProvider");
  return context;
}
