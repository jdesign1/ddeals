"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import {
  CHECK_DEALS_BELT_LABELS,
  type CheckDealsBeltId,
} from "@/lib/check-deals-belt-order";

export default function CheckDealsBeltOrderSheet({
  open,
  order,
  onChange,
  onClose,
}: {
  open: boolean;
  order: readonly CheckDealsBeltId[];
  onChange: (order: CheckDealsBeltId[]) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusInitialControl = () => {
      dialog.querySelector<HTMLElement>("button[aria-label='Close belt order']")?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.requestAnimationFrame(focusInitialControl);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    };
  }, [onClose, open]);

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
            />
            <motion.section
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="check-deals-belt-order-title"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[38vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
            >
              <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                <div>
                  <h3 id="check-deals-belt-order-title" className="dd-type-sheet-title text-stone-900">Change page order</h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close belt order"
                  className="dd-bottom-sheet-close cursor-pointer text-stone-500 hover:bg-stone-100"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-2 px-5 py-4 pb-safe-sm">
                {order.map((belt, index) => (
                  <div key={belt} className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-fair-50 px-3 py-2.5">
                    <span className="min-w-0 flex-1 dd-type-control text-stone-800">{CHECK_DEALS_BELT_LABELS[belt]}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${CHECK_DEALS_BELT_LABELS[belt]} up`}
                        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-white disabled:cursor-default disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === order.length - 1}
                        aria-label={`Move ${CHECK_DEALS_BELT_LABELS[belt]} down`}
                        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-white disabled:cursor-default disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
