"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { CalendarDays, LoaderCircle, MessageCircle, Tag, X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CommunityHelpfulButton from "@/components/CommunityHelpfulButton";
import CommunityNoteAuthor from "@/components/CommunityNoteAuthor";
import CommunityPriceNotesSheet from "@/components/CommunityPriceNotesSheet";
import InsightCarousel from "@/components/InsightCarousel";
import { useAuth } from "@/lib/auth-context";
import {
  fetchCommunityPriceNotes,
  submitCommunityPriceNote,
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

function NoteCard({ note, onHelpfulChanged }: {
  note: CommunityPriceNote;
  onHelpfulChanged: (noteId: string, helpful: boolean, helpfulCount: number) => void;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <CommunityNoteAuthor note={note} />
      {note.price !== null && <p className="mt-4 font-display text-2xl font-extrabold leading-7 text-stone-900">${note.price.toFixed(2)}</p>}
      {note.observed_on && <p className="mt-3 text-xs font-semibold text-stone-500">Seen {formatObservedDate(note.observed_on)}</p>}
      {note.body && <p className="mt-3 line-clamp-3 text-sm leading-5 text-stone-700">&ldquo;{note.body}&rdquo;</p>}
      {!note.is_own_note && (
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
  onClose,
  onSubmitted,
  returnFocusRef,
}: {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: (status: "pending" | "approved") => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { session } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const hasUnsavedInputRef = useRef(false);
  const [storeId, setStoreId] = useState("");
  const [price, setPrice] = useState("");
  const [observedOn, setObservedOn] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const resetForm = useCallback(() => {
    setStoreId("");
    setPrice("");
    setObservedOn("");
    setRegionCode("");
    setBody("");
    setSubmitting(false);
    setError(null);
    setSubmitted(false);
    hasUnsavedInputRef.current = false;
  }, []);

  const closeComposerSheet = useCallback(() => {
    if (submittingRef.current) return;
    if (hasUnsavedInputRef.current && !window.confirm("Discard this tip?")) return;
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : returnFocusRef.current;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
  }, [closeComposerSheet, isOpen, returnFocusRef]);

  useEffect(() => {
    if (isOpen && submitted) successRef.current?.focus();
  }, [isOpen, submitted]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    hasUnsavedInputRef.current = !submitted && Boolean(body.trim() || storeId || price || observedOn || regionCode);
  }, [body, observedOn, price, regionCode, storeId, submitted]);

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
      const submissionResult = await submitCommunityPriceNote(
        { productId, sourceStoreId: storeId || undefined, price: price || undefined, observedOn: observedOn || undefined, regionCode: regionCode || undefined, body },
        session.access_token,
      );
      hasUnsavedInputRef.current = false;
      setSubmitted(true);
      onSubmitted(submissionResult.status);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We couldn't send your note right now.");
    } finally {
      setSubmitting(false);
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
                  disabled={submitting}
                  aria-label="Close share a shopper tip"
                  className="dd-bottom-sheet-close absolute left-4 top-1/2 -translate-y-1/2 cursor-pointer text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
                <h2 id="community-note-composer-title" className="dd-type-sheet-title text-stone-900">Share a shopper tip</h2>
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
                      Thanks your tip will appear shortly.
                    </p>
                    <p className="mt-2 text-sm leading-5 text-stone-600">
                      Your tips will help other shoppers, and confirm price accuracy.
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
                          <h3 id="community-note-tip-heading" className="dd-type-section text-stone-900">Your tip</h3>
                          <p id="community-note-composer-description" className="mt-1 dd-type-secondary text-stone-500">Share a price tip for other deal detectives, together we can find the best transparent prices</p>
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
                    <button type="submit" disabled={submitting} className="dd-btn dd-btn-primary min-h-14 w-full cursor-pointer disabled:cursor-wait disabled:opacity-60">
                      {submitting ? "Sharing…" : "Share tip"}
                    </button>
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
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [notesSheetOpenSequence, setNotesSheetOpenSequence] = useState(0);
  const seeAllNotesButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const closeComposer = useCallback(() => setComposerOpen(false), []);
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
    setComposerOpen(true);
  };

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
                  {notes.slice(0, 3).map((note) => <NoteCard key={note.id} note={note} onHelpfulChanged={handleHelpfulChanged} />)}
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
        productId={productId}
        isOpen={composerOpen}
        onClose={closeComposer}
        onSubmitted={(status) => { if (status === "approved") reloadNotes(); }}
        returnFocusRef={addNoteButtonRef}
      />
      <CommunityPriceNotesSheet
        productId={productId}
        isOpen={notesSheetOpen}
        openSequence={notesSheetOpenSequence}
        onClose={closeNotesSheet}
        returnFocusRef={seeAllNotesButtonRef}
        onBlocked={reloadNotes}
        onHelpfulChanged={handleHelpfulChanged}
      />
    </>
  );
}
