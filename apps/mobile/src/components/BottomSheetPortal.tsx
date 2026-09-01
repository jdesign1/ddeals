"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Keeps route-local bottom sheets out of scrolling and transformed ancestors.
 * The delayed mount makes the portal safe during the server render and first
 * hydration pass, while keeping the sheet's existing AnimatePresence tree
 * intact for enter/exit animations. The wrapper also gives every sheet a
 * shared viewport-level stacking layer above the fixed bottom navigation.
 */
export default function BottomSheetPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  if (!mounted) return null;
  return createPortal(
    <div className="dd-bottom-sheet-layer">{children}</div>,
    document.body,
  );
}
