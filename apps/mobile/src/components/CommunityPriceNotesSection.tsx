"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
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

const REGION_LABELS = new Map<string, string>(REGION_OPTIONS.map(([value, label]) => [value, label]));

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

function formatRegion(value: string): string {
  return REGION_LABELS.get(value) ?? value.replace(/_/g, " ");
}

function NoteCard({ note }: { note: CommunityPriceNote }) {
  return (
    <article className="flex min-h-48 flex-col rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          {note.price !== null ? (
            <p className="font-display text-2xl font-extrabold leading-7 text-stone-900">${note.price.toFixed(2)}</p>
          ) : (
            <p className="font-display text-xl font-extrabold leading-7 text-stone-900">A shopper tip</p>
          )}
          {note.store_name && <p className="mt-1 text-sm font-bold text-stone-700">{note.store_name}</p>}
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-stone-500">Community tip</span>
      </div>
      {(note.observed_on || note.region_code) && (
        <p className="mt-3 text-xs font-semibold text-stone-500">
          {note.observed_on ? `Seen ${formatObservedDate(note.observed_on)}` : "Shared by a shopper"}
          {note.region_code ? ` · ${formatRegion(note.region_code)}` : ""}
        </p>
      )}
      {note.body && <p className="mt-3 line-clamp-3 text-sm leading-5 text-stone-700">{note.body}</p>}
      <p className="mt-auto pt-4 text-xs font-semibold text-stone-500">{note.author_display_name_snapshot}</p>
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
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<"pending" | "approved">("pending");

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const resetForm = useCallback(() => {
    setStoreId("");
    setPrice("");
    setObservedOn("");
    setRegionCode("");
    setBody("");
    setEvidenceOpen(false);
    setSubmitting(false);
    setError(null);
    setSubmitted(false);
    setSubmissionStatus("pending");
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
      setSubmissionStatus(submissionResult.status);
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
              <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between gap-4 border-b border-stone-100 px-5 py-4">
                <div className="min-w-0">
                  <h2 id="community-note-composer-title" className="dd-type-sheet-title text-stone-900">Share a shopper tip</h2>
                </div>
                <button
                  type="button"
                  onClick={closeComposerSheet}
                  disabled={submitting}
                  aria-label="Close share a shopper tip"
                  className="dd-bottom-sheet-close cursor-pointer text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {submitted ? (
                <div ref={successRef} tabIndex={-1} className="flex flex-1 flex-col justify-center gap-5 overflow-y-auto px-5 py-8 outline-none" role="status">
                  <div>
                    <p className="text-lg font-extrabold text-stone-900">
                      {submissionStatus === "approved" ? "Thanks — your tip is live for other shoppers." : "Thanks — your tip is queued for review."}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-stone-600">
                      {submissionStatus === "approved" ? "It passed our quick safety check and is now shared with the community." : "We'll check it before it appears for other shoppers."}
                    </p>
                  </div>
                  <button type="button" onClick={closeComposerSheet} className="dd-btn dd-btn-primary min-h-11 w-full cursor-pointer">Done</button>
                </div>
              ) : (
                <form onSubmit={submit} aria-describedby={error ? "community-note-form-error" : undefined} className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
                    <div className="space-y-2">
                      <label htmlFor="community-note-body" className="dd-type-meta dd-type-meta-strong text-stone-700">Your tip</label>
                      <p id="community-note-composer-description" className="text-sm leading-5 text-stone-500">Help other shoppers with a price, tip, or useful detail. Price details are optional.</p>
                      <textarea
                        id="community-note-body"
                        maxLength={500}
                        rows={4}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="For example, which size or flavour you saw"
                        autoCapitalize="sentences"
                        aria-describedby="community-note-composer-description community-note-body-counter"
                        className="mt-1 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-3 text-base leading-5 text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
                      />
                      <p id="community-note-body-counter" className="text-right text-xs text-stone-400" aria-live="polite">{body.length}/500</p>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-stone-50">
                      <button
                        type="button"
                        aria-expanded={evidenceOpen}
                        aria-controls="community-note-evidence"
                        onClick={() => setEvidenceOpen((open) => !open)}
                        className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-600"
                      >
                        <span>
                          <span className="block text-sm font-extrabold text-stone-800">Add price details</span>
                          <span className="mt-0.5 block text-xs font-semibold text-stone-500">Optional — add these details if you spotted a specific price</span>
                        </span>
                        <ChevronDown className={`h-5 w-5 flex-shrink-0 text-stone-500 transition-transform ${evidenceOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                      </button>

                      {evidenceOpen && (
                        <div id="community-note-evidence" className="space-y-4 border-t border-stone-200 px-4 pb-4 pt-4">
                          <div>
                            <label htmlFor="community-note-store" className="dd-type-meta dd-type-meta-strong text-stone-600">Supermarket <span className="font-normal text-stone-400">(optional)</span></label>
                            <select
                              id="community-note-store"
                              value={storeId}
                              onChange={(event) => setStoreId(event.target.value)}
                              className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-800 shadow-sm focus:border-stone-900 focus:outline-none"
                            >
                              <option value="">Choose a supermarket</option>
                              {STORE_OPTIONS.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
                            </select>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label htmlFor="community-note-price" className="dd-type-meta dd-type-meta-strong text-stone-600">Price <span className="font-normal text-stone-400">(optional)</span></label>
                              <div className="relative mt-1">
                                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-500">$</span>
                                <input
                                  id="community-note-price"
                                  type="number"
                                  min="0.01"
                                  max="100000"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={price}
                                  onChange={(event) => setPrice(event.target.value)}
                                  className="min-h-11 w-full rounded-xl border border-stone-300 bg-white pl-7 pr-3 text-base text-stone-800 shadow-sm focus:border-stone-900 focus:outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label htmlFor="community-note-date" className="dd-type-meta dd-type-meta-strong text-stone-600">Date spotted <span className="font-normal text-stone-400">(optional)</span></label>
                              <input
                                id="community-note-date"
                                type="date"
                                max={nzToday()}
                                value={observedOn}
                                onChange={(event) => setObservedOn(event.target.value)}
                                className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-800 shadow-sm focus:border-stone-900 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label htmlFor="community-note-region" className="dd-type-meta dd-type-meta-strong text-stone-600">Area <span className="font-normal text-stone-400">(optional)</span></label>
                            <select
                              id="community-note-region"
                              value={regionCode}
                              onChange={(event) => setRegionCode(event.target.value)}
                              className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-800 shadow-sm focus:border-stone-900 focus:outline-none"
                            >
                              <option value="">Prefer not to say</option>
                              {REGION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {error && <p id="community-note-form-error" ref={errorRef} tabIndex={-1} className="text-sm font-semibold leading-5 text-alert-600 outline-none" role="alert">{error}</p>}
                    <p className="text-xs leading-4 text-stone-500">Tips are checked for safety. Please keep it about the item — no links, contact details, or abusive language.</p>
                  </div>
                  <div className="dd-sheet-cta-footer flex-shrink-0 border-t border-stone-100 bg-white/95 px-5 pt-3">
                    <button type="submit" disabled={submitting} className="dd-btn dd-btn-primary min-h-12 w-full cursor-pointer disabled:cursor-wait disabled:opacity-60">
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
    fetchCommunityPriceNotes(productId, 3, controller.signal, session?.access_token)
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

  if (isCurrentProductLoaded && available === false) return null;

  return (
    <>
      <section
        className="dd-deal-assessment-card space-y-4 rounded-2xl border border-stone-300 bg-white p-5 text-left shadow-xs"
        aria-labelledby="community-price-notes-heading"
      >
        <div>
          <h2 id="community-price-notes-heading" className="dd-type-section text-stone-900">Help other shoppers</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">Seen this cheaper somewhere, or noticed something useful? Share a quick tip with the community. Price details are optional.</p>
        </div>

        {isLoadingCurrentProduct && (
          <div className="space-y-3" role="status" aria-label="Loading community tips" aria-busy="true">
            <div className="h-48 animate-pulse rounded-2xl bg-stone-100" />
          </div>
        )}

        {!isLoadingCurrentProduct && error && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4" role="alert">
            <p className="text-sm font-semibold text-stone-700">Community tips aren&rsquo;t available right now.</p>
            <button type="button" onClick={() => { setLoadedProductId(null); setRetryTick((tick) => tick + 1); }} className="mt-3 min-h-11 rounded-full border border-stone-400 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-white">Try again</button>
          </div>
        )}

        {!isLoadingCurrentProduct && !error && notes.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4">
            <p className="text-sm font-semibold leading-5 text-stone-700">No community tips yet.</p>
            <p className="mt-1 text-sm leading-5 text-stone-500">Know something useful about this item? Be the first to share it.</p>
          </div>
        )}

        {!isLoadingCurrentProduct && !error && notes.length > 0 && (
          <div>
            <InsightCarousel ariaLabel="Community tip previews" slideWidthClassName="w-[92%]" trackPaddingClassName="px-1">
              {notes.map((note) => <NoteCard key={note.id} note={note} />)}
            </InsightCarousel>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-stone-500">Community-reported prices may be out of date.</p>
              <button
                ref={seeAllNotesButtonRef}
                type="button"
                onClick={openNotesSheet}
                className="min-h-11 rounded-full px-2 text-sm font-bold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
              >
                See all tips
              </button>
            </div>
          </div>
        )}

        {!isLoadingCurrentProduct && !error && submissionEnabled && (
          <div className="flex flex-col items-stretch gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-5 text-stone-500">Share a price, a tip, or something useful you&rsquo;ve noticed.</p>
            <button ref={addNoteButtonRef} type="button" onClick={openComposer} className="dd-btn dd-btn-secondary min-h-11 w-full flex-shrink-0 cursor-pointer px-3 text-sm sm:w-auto">Share a tip</button>
          </div>
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
      />
    </>
  );
}
