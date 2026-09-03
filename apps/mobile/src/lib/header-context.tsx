"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Lets a page override the global `AppHeader`'s title, add a back button, or
 * publish a route-local action without going back on the "one globally-
 * mounted header" decision
 * `AppHeader.tsx` documents (2026-08-04 restyle session) -- that comment
 * explicitly flagged this as "can be added back if/when a screen needs it".
 * The deal-assessment page (2026-08-09) is the first screen that needs a
 * per-item dynamic title (the product name) plus a back arrow, matching
 * Prototype/index.html's DealModal, which renders its own `<AppHeader
 * title={product.name} onBack={...} />` per screen -- this app's AppHeader
 * can't take props the same way (it's mounted once in layout.tsx, above
 * the router outlet), so pages instead call `usePageHeader()` or
 * `useHeaderAction()` to publish state the single mounted AppHeader reads
 * back out.
 *
 * Per Prototype/index.html's own comment (line ~1569, "on the Check Deal
 * page ... opens the same account menu everywhere, instead of DealModal
 * rendering [its own]"), the account menu/avatar stays visible even when a
 * back button is showing -- AppHeader.tsx keeps rendering both.
 */
export interface HeaderOverride {
  title: string;
  onBack: () => void;
}

export interface HeaderAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

const HeaderOverrideContext = createContext<{
  override: HeaderOverride | null;
  setOverride: (o: HeaderOverride | null) => void;
  action: HeaderAction | null;
  setAction: (action: HeaderAction | null) => void;
} | null>(null);

export function HeaderOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<HeaderOverride | null>(null);
  const [action, setAction] = useState<HeaderAction | null>(null);
  return <HeaderOverrideContext.Provider value={{ override, setOverride, action, setAction }}>{children}</HeaderOverrideContext.Provider>;
}

export function useHeaderOverride() {
  const ctx = useContext(HeaderOverrideContext);
  if (!ctx) throw new Error("useHeaderOverride must be used within a HeaderOverrideProvider");
  return ctx;
}

/**
 * Publishes { title, onBack } as the current header override for as long as
 * the calling component is mounted, clearing it on unmount (e.g. navigating
 * away). `title` can change across renders (e.g. once the product name
 * finishes loading) and the header updates immediately.
 */
export function usePageHeader(title: string | null, onBack: () => void) {
  const { setOverride } = useHeaderOverride();
  useEffect(() => {
    if (title == null) return;
    setOverride({ title, onBack });
    return () => setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);
}

/**
 * Publishes one route-local action for the global header. The action is
 * cleared when the page that owns it unmounts, so a button cannot outlive its
 * page's state or callback during navigation.
 */
export function useHeaderAction(action: HeaderAction | null) {
  const { setAction } = useHeaderOverride();
  useEffect(() => {
    setAction(action);
    return () => setAction(null);
  }, [action, setAction]);
}
