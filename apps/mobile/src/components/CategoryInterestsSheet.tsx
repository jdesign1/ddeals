"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import {
  CATEGORY_INTERESTS,
  MAX_CATEGORY_INTERESTS,
  hasSameCategoryInterests,
  normalizeCategoryInterests,
} from "@/lib/category-interests";

type CategoryInterestsSheetMode = "onboarding" | "settings";

export default function CategoryInterestsSheet({
  open,
  mode,
  initialCategories,
  isSaving = false,
  error = null,
  onSave,
  onClose,
}: {
  open: boolean;
  mode: CategoryInterestsSheetMode;
  initialCategories: string[];
  isSaving?: boolean;
  error?: string | null;
  onSave: (categories: string[]) => void;
  onClose: () => void;
}) {
  const [selectedCategories, setSelectedCategories] = useState(() => normalizeCategoryInterests(initialCategories));
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const initialCategoriesRef = useRef(normalizeCategoryInterests(initialCategories));
  const onCloseRef = useRef(onClose);
  const isSavingRef = useRef(isSaving);
  const prefersReducedMotion = useReducedMotion();
  const isOnboarding = mode === "onboarding";
  const canSave = !isSaving && (!isOnboarding || selectedCategories.length > 0);
  const initialCategoriesKey = normalizeCategoryInterests(initialCategories).join("\u0000");
  useEffect(() => {
    initialCategoriesRef.current = normalizeCategoryInterests(initialCategories);
  }, [initialCategories, initialCategoriesKey]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);
  const closeSheet = useCallback(() => {
    if (isSavingRef.current) return;
    setSelectedCategories(initialCategoriesRef.current);
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSavingRef.current) {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])") ?? [],
      );
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
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) previousFocusRef.current.focus();
    };
  }, [closeSheet, open]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) => {
      if (current.includes(category)) return current.filter((item) => item !== category);
      if (current.length >= MAX_CATEGORY_INTERESTS) return current;
      return [...current, category];
    });
  };

  const hasChanges = !hasSameCategoryInterests(selectedCategories, normalizeCategoryInterests(initialCategories));

  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label={isOnboarding ? "Skip choosing deal interests" : "Close deal interests"}
              disabled={isSaving}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-950/45 disabled:cursor-not-allowed"
              onClick={closeSheet}
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            />
            <motion.section
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="category-interests-sheet-title"
              aria-describedby="category-interests-sheet-description"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl shadow-2xl"
              initial={prefersReducedMotion ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={prefersReducedMotion ? undefined : { y: "100%" }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <div>
                  <h2 id="category-interests-sheet-title" className="dd-type-sheet-title text-stone-900">
                    {isOnboarding ? "Pick your deal interests" : "Your deal interests"}
                  </h2>
                  <p className="mt-1 dd-type-meta text-stone-500">Choose up to {MAX_CATEGORY_INTERESTS}</p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeSheet}
                  disabled={isSaving}
                  aria-label="Close"
                  className="dd-bottom-sheet-close cursor-pointer text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <p id="category-interests-sheet-description" className="dd-type-secondary text-stone-600">
                  {isOnboarding
                    ? "When fresh specials arrive, Check Deals will bring the categories you care about to the top."
                    : "Choose the categories you want to see first when new specials arrive."}
                </p>
                <p className="mt-4 dd-type-meta dd-type-meta-strong text-ink-700" aria-live="polite">
                  {selectedCategories.length} of {MAX_CATEGORY_INTERESTS} selected
                </p>

                <div className="mt-5 space-y-5">
                  {CATEGORY_INTERESTS.map((section) => (
                    <div key={section.title}>
                      <h3 className="dd-type-meta dd-type-meta-strong text-stone-500">{section.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {section.categories.map((category) => {
                          const selected = selectedCategories.includes(category);
                          const atLimit = selectedCategories.length >= MAX_CATEGORY_INTERESTS && !selected;
                          return (
                            <button
                              key={category}
                              type="button"
                              disabled={isSaving || atLimit}
                              aria-pressed={selected}
                              onClick={() => toggleCategory(category)}
                              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 dd-type-control transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 disabled:cursor-not-allowed ${
                                selected
                                  ? "border-fair-500 bg-fair-50 text-ink-900"
                                  : atLimit
                                    ? "border-stone-100 bg-stone-50 text-stone-300"
                                    : "border-stone-200 bg-white text-stone-700 hover:border-ink-300 hover:bg-stone-50"
                              }`}
                            >
                              {selected && <Check className="h-4 w-4 text-fair-700" strokeWidth={2.5} aria-hidden="true" />}
                              {category}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dd-sheet-cta-footer flex flex-shrink-0 flex-col gap-2 border-t border-stone-100 px-5 pt-3">
                {error && <p role="alert" className="dd-type-secondary text-alert-700">{error}</p>}
                <button
                  type="button"
                  onClick={() => onSave(selectedCategories)}
                  disabled={!canSave || (!isOnboarding && !hasChanges)}
                  aria-busy={isSaving}
                  className="dd-btn dd-btn-primary min-h-12 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : isOnboarding ? "Save interests" : "Save changes"}
                </button>
                {isOnboarding && (
                  <button
                    type="button"
                    onClick={closeSheet}
                    disabled={isSaving}
                    className="min-h-11 cursor-pointer rounded-full px-4 dd-type-control text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Not now
                  </button>
                )}
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
