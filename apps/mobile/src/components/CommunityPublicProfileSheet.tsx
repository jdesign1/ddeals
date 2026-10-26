"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CommunityProfileDetails from "@/components/CommunityProfileDetails";
import { CommunityProfileStats } from "@/components/CommunityProfileSummary";
import { fetchCommunityPublicProfile, type CommunityProfileSummary } from "@/lib/community-notes-api";

function authorInitial(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "S";
}

export default function CommunityPublicProfileSheet({
  isOpen,
  noteId,
  displayName,
  requestKey,
  returnFocusRef,
  onClose,
}: {
  isOpen: boolean;
  noteId: string | null;
  displayName: string;
  requestKey: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [summary, setSummary] = useState<CommunityProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const safeDisplayName = displayName.trim() || "Community shopper";
  const loading = Boolean(isOpen && noteId && requestKey && loadedRequestKey !== requestKey);
  const visibleSummary = loadedRequestKey === requestKey ? summary : null;
  const visibleError = loadedRequestKey === requestKey ? error : null;

  useEffect(() => {
    if (!isOpen || !noteId || !requestKey) return;
    const controller = new AbortController();
    fetchCommunityPublicProfile(noteId, controller.signal)
      .then((nextSummary) => {
        setSummary(nextSummary);
        setError(null);
        setLoadedRequestKey(requestKey);
      })
      .catch((nextError: unknown) => {
        if (nextError instanceof DOMException && nextError.name === "AbortError") return;
        setSummary(null);
        setError(nextError instanceof Error ? nextError.message : "This shopper profile is unavailable right now.");
        setLoadedRequestKey(requestKey);
      });
    return () => controller.abort();
  }, [isOpen, noteId, requestKey]);

  useEffect(() => {
    if (!isOpen) return;
    const returnFocusTarget = returnFocusRef.current;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : returnFocusTarget;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
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
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      const focusTarget = [returnFocusTarget, previousFocusRef.current]
        .find((target): target is HTMLElement => Boolean(target?.isConnected))
        ?? document.querySelector<HTMLElement>("main button, main a[href], main [tabindex]:not([tabindex='-1'])");
      if (focusTarget && document.contains(focusTarget)) focusTarget.focus();
    };
  }, [isOpen, onClose, returnFocusRef]);

  return (
    <BottomSheetPortal open={isOpen}>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              onClick={onClose}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[70] mx-auto w-full max-w-[480px] bg-stone-950/75"
              aria-hidden="true"
            />
            <motion.div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="community-public-profile-title"
              initial={prefersReducedMotion ? false : { y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { y: "100%", opacity: 0.5 }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", damping: 25, stiffness: 220 }}
              className="dd-bottom-sheet fixed inset-x-0 bottom-0 z-[71] mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl text-white shadow-2xl outline-none"
              style={{ backgroundColor: "var(--color-ink-950)" }}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h2 id="community-public-profile-title" className="dd-type-sheet-title text-white">Shopper profile</h2>
                  <p className="mt-1 dd-type-meta text-white/60">Community activity and helpful tip stats</p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close shopper profile"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-fair-300"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-fair-400 font-display text-2xl font-extrabold text-ink-950 ring-2 ring-fair-200/50" aria-hidden="true">
                    {authorInitial(safeDisplayName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold text-white">{safeDisplayName}</p>
                    <p className="mt-1 dd-type-meta text-white/60">Community shopper</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4" aria-busy={loading}>
                  <p className="dd-type-secondary dd-type-secondary-strong text-white">Shopper stats</p>
                  <p className="mt-1 dd-type-meta text-white/65">Published tips and helpful votes contribute to the Deal Detective rank.</p>
                  <CommunityProfileStats summary={visibleSummary} loading={loading} error={visibleError} isDark showCommunityRank={false} />
                </div>

                {visibleSummary && (
                  <CommunityProfileDetails
                    city={visibleSummary.city}
                    favoriteStoreBranch={visibleSummary.favorite_store_branch}
                    quote={visibleSummary.profile_quote}
                    isDark
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
