"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore, type ReactNode, type TouchEvent } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function stopTouchPropagation(event: TouchEvent<HTMLDivElement>) {
  event.stopPropagation();
}

/**
 * Keeps route-local bottom sheets out of scrolling and transformed ancestors.
 * The delayed mount makes the portal safe during the server render and first
 * hydration pass, while keeping the sheet's existing AnimatePresence tree
 * intact for enter/exit animations. The wrapper also gives every sheet a
 * shared viewport-level stacking layer above the fixed bottom navigation.
 */
export default function BottomSheetPortal({
  children,
  open,
}: {
  children: ReactNode;
  open: boolean;
}) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  if (!mounted) return null;
  return createPortal(
    <div
      className="dd-bottom-sheet-layer"
      data-sheet-open={open ? "true" : "false"}
      onTouchStart={stopTouchPropagation}
      onTouchMove={stopTouchPropagation}
      onTouchEnd={stopTouchPropagation}
      onTouchCancel={stopTouchPropagation}
    >
      {children}
    </div>,
    document.body,
  );
}
