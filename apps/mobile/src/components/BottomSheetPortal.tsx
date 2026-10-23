"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useSyncExternalStore, type ReactNode, type TouchEvent } from "react";

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
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mounted || !open || !layerRef.current) return;
    const siblings = Array.from(document.body.children)
      .filter((child): child is HTMLElement => child !== layerRef.current && child instanceof HTMLElement);
    const previous = siblings.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    siblings.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    return () => {
      previous.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [mounted, open]);

  if (!mounted) return null;
  return createPortal(
    <div
      ref={layerRef}
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
