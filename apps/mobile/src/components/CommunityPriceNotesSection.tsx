"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { CalendarDays, LoaderCircle, MessageCircle, Pencil, Tag, Trash2, X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CommunityHelpfulButton from "@/components/CommunityHelpfulButton";
import CommunityNoteAuthor from "@/components/CommunityNoteAuthor";
import CommunityPriceNotesSheet from "@/components/CommunityPriceNotesSheet";
import InsightCarousel from "@/components/InsightCarousel";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import { useAuth } from "@/lib/auth-context";
import {
  fetchCommunityPriceNotes,
  submitCommunityPriceNote,
  updateCommunityPriceNote,
  deleteCommunityPriceNote,
  type CommunityPriceNote,
} from "@/lib/community-notes-api";

const STORE_OPTIONS = [
  { id: "newworld", label: "New World" },
  { id: "paknsave", label: "PAK'nSAVE" },
  { id: "woolworths", label: "Woolworths" },
  { id: "foursquare", label: "Four Square" },
  { id: "supervalue", label: "SuperValue" },
  { id: "chemistwarehouse", label: "Chemist Warehouse" },
];

const REGION_OPTIONS = [
  ["northland", "Northland"],
  ["auckland", "Auckland"],
  ["waikato", "Waikato"],
  ["bay_of_plenty", "Bay of Plenty"],
  ["gisborne", "Gisborne"],
  ["hawkes_bay", "Hawke's Bay"],
  ["taranaki", "Taranaki"],
  ["manawatu_whanganui", "Manawatū-Whanganui"],
  ["wellington", "Wellington"],
  ["tasman", "Tasman"],
  ["nelson", "Nelson"],
  ["marlborough", "Marlborough"],
  ["west_coast", "West Coast"],
  ["canterbury", "Canterbury"],
  ["otago", "Otago"],
  ["southland", "Southland"],
] as const;

const FORM_CONTROL_CLASS = "h-14 w-full rounded-2xl border border-stone-200 bg-white px-4 text-base text-stone-800 shadow-sm transition-colors placeholder:text-stone-400 focus:border-ink-600 focus:outline-none focus:ring-2 focus:ring-ink-600/10";

function formatObservedDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function nzToday(): string {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Pacific/Auckland",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function NoteCard({ note, onEdit, onHelpfulChanged }: {
  note: CommunityPriceNote;
  onEdit: (note: CommunityPriceNote, returnFocusTarget?: HTMLButtonElement | null) => void;
  onHelpfulChanged: (noteId: string, helpful: boolean, helpfulCount: number) => void;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <CommunityNoteAuthor
        note={note}
        showStoreBadge={false}
        trailingAction={note.is_own_note ? (
          <button
            type="button"
            onClick={(event) => onEdit(note, event.currentTarget)}
            aria-label="Edit your shopper tip"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-300"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : undefined}
      />
      {note.status === "pending" && (
        <p className="mt-3 rounded-xl border border-fair-200 bg-fair-50 px-3 py-2 text-xs font-semibold leading-4 text-fair-900" role="status">
          Pending - tip will update shortly.
        </p>
      )}
      {(note.price !== null || note.store_name) && (
        <div className="mt-4 flex items-center gap-3">
          {note.price !== null && <p className="font-display text-2xl font-extrabold leading-7 text-stone-900">${note.price.toFixed(2)}</p>}
          {note.store_name && <StoreLogoBadge store={note.store_name} variant="card" />}
        </div>
      )}
      {note.observed_on && <p className="mt-3 text-xs font-semibold text-stone-500">Seen {formatObservedDate(note.observed_on)}</p>}
      {note.body && <p className="mt-3 line-clamp-3 text-sm leading-5 text-stone-700">&ldquo;{note.body}&rdquo;</p>}
      {!note.is_own_note && note.status === "approved" && (
        <div className="mt-4 border-t border-stone-200 pt-3">
          <CommunityHelpfulButton note={note} onChanged={onHelpfulChanged} />
        </div>
      )}
    </article>
  );
}

function NoteComposer({
  productId,
  isOpen,
  editingNote,
  onClose,
  onComplete,
  onRemoved,
  returnFocusRef,
}: {
  productId: string;
  isOpen: boolean;
  editingNote: CommunityPriceNote | null;
  onClose: () => void;
  onComplete: (status: "pending" | "approved") => void;
  onRemoved: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { session } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement>(null);
  const removeConfirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const removingRef = useRef(false);
  const hasUnsavedInputRef = useRef(false);
  const removeErrorRef = useRef<HTMLParagraphElement>(null);
  const [storeId, setStoreId] = useState(editingNote?.source_store_id ?? "");
  const [price, setPrice] = useState(editingNote?.price === null || editingNote?.price === undefined ? "" : editingNote.price.toFixed(2));
  const [observedOn, setObservedOn] = useState(editingNote?.observed_on ?? "");
  const [regionCode, setRegionCode] = useState(editingNote?.region_code ?? "");
  const [body, setBody] = useState(editingNote?.body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    removingRef.current = removing;
  }, [removing]);

  const resetForm = useCallback(() => {
    setStoreId("");
    setPrice("");
    setObservedOn("");
    setRegionCode("");
    setBody("");
    setSubmitting(false);
    setRemoving(false);
    setError(null);
    setRemoveConfirmOpen(false);
    setRemoveError(null);
    setSubmitted(false);
    hasUnsavedInputRef.current = false;
  }, []);

  const cancelRemoveConfirmation = useCallback(() => {
    setRemoveConfirmOpen(false);
    setRemoveError(null);
    window.requestAnimationFrame(() => removeTriggerRef.current?.focus());
  }, []);

  const closeComposerSheet = useCallback(() => {
    if (removeConfirmOpen) {
      cancelRemoveConfirmation();
      return;
    }
    if (submittingRef.current || removingRef.current) return;
    if (hasUnsavedInputRef.current && !window.confirm("Discard this tip?")) return;
    resetForm();
    onClose();
  }, [cancelRemoveConfirmation, onClose, removeConfirmOpen, resetForm]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = returnFocusRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (removeConfirmOpen) {
          event.preventDefault();
          cancelRemoveConfirmation();
          return;
        }
        closeComposerSheet();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) {
        event.preventDefault();
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
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) previousFocusRef.current.focus();
    };
  }, [cancelRemoveConfirmation, closeComposerSheet, isOpen, removeConfirmOpen, returnFocusRef]);

  useEffect(() => {
    if (!removeConfirmOpen) return;
    const frame = window.requestAnimationFrame(() => removeConfirmRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [removeConfirmOpen]);

  useEffect(() => {
    if (isOpen && submitted) successRef.current?.focus();
  }, [isOpen, submitted]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (removeError) removeErrorRef.current?.focus();
  }, [removeError]);

  useEffect(() => {
    const initialStoreId = editingNote?.source_store_id ?? "";
    const initialPrice = editingNote?.price === null || editingNote?.price === undefined ? "" : editingNote.price.toFixed(2);
    const initialObservedOn = editingNote?.observed_on ?? "";
    const initialRegionCode = editingNote?.region_code ?? "";
    const initialBody = editingNote?.body ?? "";
    const hasChanged = storeId !== initialStoreId
      || price !== initialPrice
      || observedOn !== initialObservedOn
      || regionCode !== initialRegionCode
      || body !== initialBody;
    hasUnsavedInputRef.current = !submitted && hasChanged;
  }, [body, editingNote, observedOn, price, regionCode, storeId, submitted]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.access_token) {
      setError("Please log in again before sharing a note.");
      return;
    }
    const hasCompletePriceEvidence = Boolean(storeId && price && observedOn);
    if (!body.trim() && !hasCompletePriceEvidence) {
      setError("Add a short tip, or add the supermarket, price and date so there’s something useful to share.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const noteInput = { sourceStoreId: storeId || undefined, price: price || undefined, observedOn: observedOn || undefined, regionCode: regionCode || undefined, body };
      const submissionResult = editingNote
        ? await updateCommunityPriceNote(editingNote.id, noteInput, session.access_token)
        : await submitCommunityPriceNote({ productId, ...noteInput }, session.access_token);
      hasUnsavedInputRef.current = false;
      setSubmitted(true);
      onComplete(submissionResult.status);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We couldn't send your note right now.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeTip = async () => {
    if (!editingNote) return;
    if (!session?.access_token) {
      setRemoveError("Please log in again before removing your tip.");
      return;
    }
    setRemoveError(null);
    setRemoving(true);
    try {
      await deleteCommunityPriceNote(editingNote.id, session.access_token);
      onRemoved();
    } catch (removalError) {
      setRemoveError(removalError instanceof Error ? removalError.message : "We couldn't remove your tip right now.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <BottomSheetPortal open={isOpen}>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              onClick={closeComposerSheet}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
              aria-hidden="true"
            />
            <motion.div
              initial={prefersReducedMotion ? false : { y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { y: "100%", opacity: 0.5 }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", damping: 25, stiffness: 220 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="community-note-composer-title"
              aria-describedby={submitted ? undefined : "community-note-composer-description"}
              tabIndex={-1}
              ref={dialogRef}
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl shadow-2xl outline-none"
            >
              <div className="dd-bottom-sheet-titlebar relative flex h-16 flex-shrink-0 items-center justify-center border-b border-stone-100 px-5">
                <button
                  type="button"
                  onClick={closeComposerSheet}
                  disabled={submitting || removing}
                  aria-label={editingNote ? "Close edit shopper tip" : "Close share a shopper tip"}
                  className="dd-bottom-sheet-close absolute left-4 top-1/2 -translate-y-1/2 cursor-pointer text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
                <h2 id="community-note-composer-title" className="dd-type-sheet-title text-stone-900">{editingNote ? "Edit your shopper tip" : "Share a shopper tip"}</h2>
              </div>

              {submitted ? (
                <div ref={successRef} tabIndex={-1} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 overflow-x-hidden overflow-y-auto px-5 py-8 text-center outline-none" role="status">
                  <motion.span
                    key="community-note-success-check"
                    initial={prefersReducedMotion ? false : { scale: 0 }}
                    animate={{ scale: prefersReducedMotion ? 1 : [0, 1, 1.2, 1] }}
                    transition={prefersReducedMotion
                      ? { duration: 0 }
                      : { duration: 0.62, times: [0, 0.52, 0.76, 1], ease: [0.22, 1, 0.36, 1] }}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-fair-500 font-display text-4xl font-extrabold leading-none text-ink-900 shadow-sm"
                    aria-hidden="true"
                  >
                    ✓
                  </motion.span>
                  <div>
                    <p className="text-lg font-extrabold text-stone-900">
                      {editingNote ? "Your tip was updated." : "Thanks — your tip will appear shortly."}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-stone-600">
                      {editingNote ? "It will return to the community after it passes review. Helpful votes were reset for this update." : "Your tips will help other shoppers, and confirm price accuracy."}
                    </p>
                  </div>
                  <button type="button" onClick={closeComposerSheet} className="dd-btn dd-btn-primary min-h-14 w-full cursor-pointer">Done</button>
                </div>
              ) : (
                <form onSubmit={submit} aria-describedby={error ? "community-note-form-error" : undefined} className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pb-6 pt-6">
                    <section className="rounded-3xl border border-stone-200/80 bg-white p-4 shadow-xs" aria-labelledby="community-note-tip-heading">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-fair-50 text-fair-700 ring-1 ring-fair-100">
                          <MessageCircle className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 id="community-note-tip-heading" className="dd-type-section text-stone-900">{editingNote ? "Update your tip" : "Your tip"}</h3>
                          <p id="community-note-composer-description" className="mt-1 dd-type-secondary text-stone-500">{editingNote ? "Changes are checked before the updated tip is shown to other shoppers." : "Share a price tip for other deal detectives, together we can find the best transparent prices"}</p>
                        </div>
                      </div>
                      <label htmlFor="community-note-body" className="sr-only">Your tip</label>
                      <textarea
                        id="community-note-body"
                        maxLength={500}
                        rows={4}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="For example, which size or flavour you saw"
                        autoCapitalize="sentences"
                        aria-describedby="community-note-composer-description community-note-body-counter"
                        className="mt-4 min-h-36 w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base leading-5 text-stone-800 shadow-sm transition-colors placeholder:text-stone-400 focus:border-ink-600 focus:outline-none focus:ring-2 focus:ring-ink-600/10"
                      />
                      <p id="community-note-body-counter" className="mt-2 text-right dd-type-meta dd-type-meta-strong text-stone-400" aria-live="polite">{body.length}/500</p>
                    </section>

                    <fieldset id="community-note-evidence" className="mt-4 rounded-3xl border border-stone-200/80 bg-white p-4 shadow-xs" aria-describedby="community-note-evidence-description">
                      <legend className="sr-only">Price details (optional)</legend>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-fair-50 text-fair-700 ring-1 ring-fair-100">
                          <Tag className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 id="community-note-evidence-heading" className="dd-type-section text-stone-900">Price details <span className="font-normal text-stone-400">(optional)</span></h3>
                          <p id="community-note-evidence-description" className="mt-1 dd-type-secondary text-stone-500">Add these if you spotted a specific price.</p>
                        </div>
                      </div>
                      <div className="mt-4 min-w-0 space-y-4">
                        <div>
                          <label htmlFor="community-note-store" className="dd-type-control text-stone-700">Supermarket</label>
                          <select id="community-note-store" value={storeId} onChange={(event) => setStoreId(event.target.value)} className={`mt-2 ${FORM_CONTROL_CLASS}`}>
                            <option value="">Choose a supermarket</option>
                            {STORE_OPTIONS.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
                          </select>
                        </div>

                        <div className="grid min-w-0 grid-cols-1 gap-4 min-[400px]:grid-cols-2">
                          <div className="min-w-0">
                            <label htmlFor="community-note-price" className="dd-type-control text-stone-700">Price</label>
                            <div className="relative mt-2 min-w-0">
                              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-stone-500">$</span>
                              <input id="community-note-price" type="number" min="0.01" max="100000" step="0.01" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className={`${FORM_CONTROL_CLASS} min-w-0 pl-9`} />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <label htmlFor="community-note-date" className="dd-type-control text-stone-700">Date spotted</label>
                            <div className="relative mt-2 min-w-0">
                              <input id="community-note-date" type="date" max={nzToday()} value={observedOn} onChange={(event) => setObservedOn(event.target.value)} className={`${FORM_CONTROL_CLASS} min-w-0 appearance-none pr-12`} />
                              <CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500" aria-hidden="true" />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="community-note-region" className="dd-type-control text-stone-700">Area</label>
                          <select id="community-note-region" value={regionCode} onChange={(event) => setRegionCode(event.target.value)} className={`mt-2 ${FORM_CONTROL_CLASS}`}>
                            <option value="">Prefer not to say</option>
                            {REGION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                      </div>
                    </fieldset>

                    <div className="mt-6 space-y-3">
                      {error && <p id="community-note-form-error" ref={errorRef} tabIndex={-1} className="text-sm font-semibold leading-5 text-alert-600 outline-none" role="alert">{error}</p>}
                      <p className="dd-type-secondary text-stone-500">Tips are checked for safety. Please keep it about the item — no links, contact details, or abusive language.</p>
                    </div>
                  </div>
                  <div className="dd-sheet-cta-footer flex-shrink-0 border-t border-stone-100 bg-white/95 px-5 pt-3">
                    {editingNote && removeConfirmOpen ? (
                      <div className="space-y-3" role="alertdialog" aria-labelledby="community-note-remove-title" aria-describedby="community-note-remove-description">
                        <div>
                          <p id="community-note-remove-title" className="text-sm font-bold leading-5 text-stone-900">Remove this tip?</p>
                          <p id="community-note-remove-description" className="mt-1 text-sm leading-5 text-stone-700">This removes it from the community and can&rsquo;t be undone.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button ref={removeConfirmRef} type="button" onClick={removeTip} disabled={removing} className="dd-btn dd-btn-outline-alert min-h-11 cursor-pointer disabled:opacity-60">
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                            {removing ? "Removing…" : "Remove tip"}
                          </button>
                          <button type="button" onClick={cancelRemoveConfirmation} disabled={removing} className="dd-btn dd-btn-outline min-h-11 cursor-pointer">Cancel</button>
                        </div>
                        {removeError && <p ref={removeErrorRef} tabIndex={-1} className="text-sm font-semibold text-alert-600 outline-none" role="alert">{removeError}</p>}
                      </div>
                    ) : (
                      <>
                        <button type="submit" disabled={submitting || removing} className="dd-btn dd-btn-primary min-h-14 w-full cursor-pointer disabled:cursor-wait disabled:opacity-60">
                          {submitting ? (editingNote ? "Updating…" : "Sharing…") : (editingNote ? "Update tip" : "Share tip")}
                        </button>
                        {editingNote && (
                          <button ref={removeTriggerRef} type="button" onClick={() => { setRemoveConfirmOpen(true); setRemoveError(null); }} disabled={submitting || removing} className="dd-btn dd-btn-outline-alert mt-3 min-h-11 w-full cursor-pointer disabled:opacity-60">
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                            Remove tip
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}

export default function CommunityPriceNotesSection({ productId }: { productId: string }) {
  const pathname = usePathname();
  const { user, session, isAnonymousSession, openAuthSheet } = useAuth();
  const addNoteButtonRef = useRef<HTMLButtonElement>(null);
  const [notes, setNotes] = useState<CommunityPriceNote[]>([]);
  const [loadedProductId, setLoadedProductId] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submissionEnabled, setSubmissionEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<CommunityPriceNote | null>(null);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [notesSheetOpenSequence, setNotesSheetOpenSequence] = useState(0);
  const seeAllNotesButtonRef = useRef<HTMLButtonElement>(null);
  const composerReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setEditingNote(null);
  }, []);
  const closeNotesSheet = useCallback(() => setNotesSheetOpen(false), []);
  const openNotesSheet = useCallback(() => {
    setNotesSheetOpenSequence((sequence) => sequence + 1);
    setNotesSheetOpen(true);
  }, []);
  const reloadNotes = useCallback(() => {
    setLoadedProductId(null);
    setRetryTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchCommunityPriceNotes(productId, 4, controller.signal, session?.access_token)
      .then((nextNotes) => {
        if (!cancelled) {
          setNotes(nextNotes.notes);
          setAvailable(nextNotes.available);
          setSubmissionEnabled(nextNotes.submissionsEnabled);
          setError(null);
          setLoadedProductId(productId);
        }
      })
      .catch((nextError: unknown) => {
        if (nextError instanceof DOMException && nextError.name === "AbortError") return;
        if (!cancelled) {
          setAvailable(true);
          setError(nextError instanceof Error ? nextError.message : "Community notes are unavailable right now.");
          setLoadedProductId(productId);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [productId, retryTick, session?.access_token]);

  const openComposer = () => {
    if (!user || isAnonymousSession || !session?.access_token) {
      openAuthSheet("Log in to share a community tip. After signing in, return here and tap Share a tip again.", pathname);
      return;
    }
    composerReturnFocusRef.current = addNoteButtonRef.current;
    setEditingNote(null);
    setComposerOpen(true);
  };

  const openEditComposer = useCallback((note: CommunityPriceNote, returnFocusTarget?: HTMLButtonElement | null) => {
    if (!note.is_own_note) return;
    composerReturnFocusRef.current = returnFocusTarget ?? addNoteButtonRef.current;
    setNotesSheetOpen(false);
    setEditingNote(note);
    setComposerOpen(true);
  }, []);

  const isCurrentProductLoaded = loadedProductId === productId;
  const isLoadingCurrentProduct = !isCurrentProductLoaded;
  const handleHelpfulChanged = useCallback((noteId: string, helpful: boolean, helpfulCount: number) => {
    setNotes((currentNotes) => currentNotes.map((note) => note.id === noteId
      ? { ...note, viewer_has_helpful_vote: helpful, helpful_count: helpfulCount }
      : note));
  }, []);

  if (isCurrentProductLoaded && available === false) return null;

  return (
    <>
      <section
        className="dd-deal-assessment-card space-y-4 rounded-2xl border border-stone-300 bg-white p-5 text-left shadow-xs"
        aria-labelledby="community-price-notes-heading"
      >
        <div>
          <h2 id="community-price-notes-heading" className="dd-type-section text-stone-900">Help other shoppers</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">Seen this cheaper somewhere, or noticed something useful? Share a quick tip with the community.</p>
        </div>

        {isLoadingCurrentProduct && (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50" role="status" aria-label="Loading community tips" aria-busy="true">
            <LoaderCircle className="h-6 w-6 animate-spin text-stone-500 motion-reduce:animate-none" aria-hidden="true" />
          </div>
        )}

        {!isLoadingCurrentProduct && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
            className="space-y-4"
          >
            {error && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4" role="alert">
                <p className="text-sm font-semibold text-stone-700">Community tips aren&rsquo;t available right now.</p>
                <button type="button" onClick={() => { setLoadedProductId(null); setRetryTick((tick) => tick + 1); }} className="mt-3 min-h-11 rounded-full border border-stone-400 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-white">Try again</button>
              </div>
            )}

            {!error && notes.length === 0 && (
              <div className="rounded-xl border border-stone-300 bg-stone-50 p-4">
                <p className="text-sm font-semibold leading-5 text-stone-700">No community tips yet.</p>
                <p className="mt-1 text-sm leading-5 text-stone-500">Know something useful about this item? Be the first to share it.</p>
              </div>
            )}

            {!error && notes.length > 0 && (
              <div>
                <InsightCarousel ariaLabel="Community tip previews" slideWidthClassName="w-[92%]" trackPaddingClassName="px-1">
                  {notes.slice(0, 3).map((note) => <NoteCard key={note.id} note={note} onEdit={openEditComposer} onHelpfulChanged={handleHelpfulChanged} />)}
                </InsightCarousel>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-stone-500">Community-reported prices may be out of date.</p>
                  {notes.length > 3 && <button ref={seeAllNotesButtonRef} type="button" onClick={openNotesSheet} className="min-h-11 rounded-full px-2 text-sm font-bold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-900">See all tips</button>}
                </div>
              </div>
            )}

            {!error && submissionEnabled && (
              <div className="flex justify-end border-t border-stone-100 pt-4">
                <button ref={addNoteButtonRef} type="button" onClick={openComposer} className="dd-btn dd-btn-outline dd-btn-outline-thin min-h-11 w-full flex-shrink-0 cursor-pointer text-sm sm:w-auto">Share a tip</button>
              </div>
            )}
          </motion.div>
        )}
      </section>
      <NoteComposer
        key={editingNote?.id ?? "new-community-note"}
        productId={productId}
        isOpen={composerOpen}
        editingNote={editingNote}
        onClose={closeComposer}
        onComplete={() => reloadNotes()}
        onRemoved={() => {
          closeComposer();
          reloadNotes();
        }}
        returnFocusRef={composerReturnFocusRef}
      />
      <CommunityPriceNotesSheet
        productId={productId}
        isOpen={notesSheetOpen}
        openSequence={notesSheetOpenSequence}
        onClose={closeNotesSheet}
        returnFocusRef={seeAllNotesButtonRef}
        onBlocked={reloadNotes}
        onHelpfulChanged={handleHelpfulChanged}
        onEdit={openEditComposer}
      />
    </>
  );
}
