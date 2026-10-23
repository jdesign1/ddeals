"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
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
          <p className="font-display text-2xl font-extrabold leading-7 text-stone-900">${note.price.toFixed(2)}</p>
          <p className="mt-1 text-sm font-bold text-stone-700">{note.store_name}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-stone-500">Community note</span>
      </div>
      <p className="mt-3 text-xs font-semibold text-stone-500">
        Seen {formatObservedDate(note.observed_on)}
        {note.region_code ? ` · ${formatRegion(note.region_code)}` : ""}
      </p>
      {note.body && <p className="mt-3 line-clamp-3 text-sm leading-5 text-stone-700">{note.body}</p>}
      <p className="mt-auto pt-4 text-xs font-semibold text-stone-500">{note.author_display_name_snapshot}</p>
    </article>
  );
}

function NoteComposer({
  productId,
  isOpen,
  onClose,
  returnFocusRef,
}: {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { session } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const [storeId, setStoreId] = useState("");
  const [price, setPrice] = useState("");
  const [observedOn, setObservedOn] = useState(nzToday);
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
    setObservedOn(nzToday());
    setRegionCode("");
    setBody("");
    setSubmitting(false);
    setError(null);
    setSubmitted(false);
  }, []);

  const closeComposerSheet = useCallback(() => {
    if (submittingRef.current) return;
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : returnFocusRef.current;
    const frame = window.requestAnimationFrame(() => firstFieldRef.current?.focus());
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

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.access_token) {
      setError("Please log in again before sharing a note.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitCommunityPriceNote(
        { productId, sourceStoreId: storeId, price, observedOn, regionCode, body },
        session.access_token,
      );
      setSubmitted(true);
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeComposerSheet}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
              aria-hidden="true"
            />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.5 }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", damping: 25, stiffness: 220 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="community-note-composer-title"
              aria-describedby="community-note-composer-description"
              ref={dialogRef}
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
            >
              <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <div>
                  <h2 id="community-note-composer-title" className="dd-type-sheet-title text-stone-900">Add a price note</h2>
                  <p id="community-note-composer-description" className="mt-1 text-sm text-stone-500">Share a price you spotted in New Zealand.</p>
                </div>
                <button
                  type="button"
                  onClick={closeComposerSheet}
                  disabled={submitting}
                  aria-label="Close price note form"
                  className="dd-bottom-sheet-close text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {submitted ? (
                <div ref={successRef} tabIndex={-1} className="flex flex-1 flex-col justify-center gap-5 overflow-y-auto px-5 py-8 outline-none" role="status">
                  <div>
                    <p className="text-lg font-extrabold text-stone-900">Thanks — your price note was sent for review.</p>
                    <p className="mt-2 text-sm leading-5 text-stone-600">We&rsquo;ll check it before it appears for other shoppers.</p>
                  </div>
                  <button type="button" onClick={closeComposerSheet} className="dd-btn dd-btn-primary min-h-11 w-full cursor-pointer">Done</button>
                </div>
              ) : (
                <form onSubmit={submit} aria-describedby={error ? "community-note-form-error" : undefined} className="flex min-h-0 flex-1 flex-col">
                  <div className="space-y-4 overflow-y-auto px-5 py-5">
                    <div>
                      <label htmlFor="community-note-store" className="dd-type-meta dd-type-meta-strong text-stone-600">Supermarket</label>
                      <select
                        id="community-note-store"
                        ref={firstFieldRef}
                        required
                        value={storeId}
                        onChange={(event) => setStoreId(event.target.value)}
                        className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-800 shadow-sm focus:border-stone-900 focus:outline-none"
                      >
                        <option value="">Choose a supermarket</option>
                        {STORE_OPTIONS.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="community-note-price" className="dd-type-meta dd-type-meta-strong text-stone-600">Price</label>
                        <div className="relative mt-1">
                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-500">$</span>
                          <input
                            id="community-note-price"
                            required
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
                        <label htmlFor="community-note-date" className="dd-type-meta dd-type-meta-strong text-stone-600">Seen on</label>
                        <input
                          id="community-note-date"
                          required
                          type="date"
                          max={nzToday()}
                          value={observedOn}
                          onChange={(event) => setObservedOn(event.target.value)}
                          className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-800 shadow-sm focus:border-stone-900 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="community-note-region" className="dd-type-meta dd-type-meta-strong text-stone-600">Region <span className="font-normal text-stone-400">(optional)</span></label>
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

                    <div>
                      <label htmlFor="community-note-body" className="dd-type-meta dd-type-meta-strong text-stone-600">Note <span className="font-normal text-stone-400">(optional)</span></label>
                      <textarea
                        id="community-note-body"
                        maxLength={500}
                        rows={3}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="For example, which size or flavour you saw"
                        aria-describedby="community-note-body-counter"
                        className="mt-1 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base leading-5 text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
                      />
                      <p id="community-note-body-counter" className="mt-1 text-right text-xs text-stone-400">{body.length}/500</p>
                    </div>

                    {error && <p id="community-note-form-error" ref={errorRef} tabIndex={-1} className="text-sm font-semibold leading-5 text-alert-600 outline-none" role="alert">{error}</p>}
                    <p className="text-xs leading-4 text-stone-500">We check notes for safety and relevance before they appear publicly. Please share only price information—no contact details, links, or abusive language.</p>
                  </div>
                  <div className="flex-shrink-0 border-t border-stone-100 px-5 pb-5 pt-3">
                    <button type="submit" disabled={submitting} className="dd-btn dd-btn-primary min-h-11 w-full cursor-pointer disabled:cursor-wait disabled:opacity-60">
                      {submitting ? "Sending…" : "Send for review"}
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
      openAuthSheet("Log in to share a price note. After signing in, return here and tap Add a price note again.", pathname);
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
          <h2 id="community-price-notes-heading" className="dd-type-section text-stone-900">Community price notes</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">Price sightings shared by other shoppers. They are separate from our official deal assessment.</p>
        </div>

        {isLoadingCurrentProduct && (
          <div className="space-y-3" role="status" aria-label="Loading community price notes" aria-busy="true">
            <div className="h-48 animate-pulse rounded-2xl bg-stone-100" />
          </div>
        )}

        {!isLoadingCurrentProduct && error && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4" role="alert">
            <p className="text-sm font-semibold text-stone-700">Community notes aren&rsquo;t available right now.</p>
            <button type="button" onClick={() => { setLoadedProductId(null); setRetryTick((tick) => tick + 1); }} className="mt-3 min-h-11 rounded-full border border-stone-400 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-white">Try again</button>
          </div>
        )}

        {!isLoadingCurrentProduct && !error && notes.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4">
            <p className="text-sm font-semibold leading-5 text-stone-700">No community notes yet.</p>
            <p className="mt-1 text-sm leading-5 text-stone-500">Seen this product at another price? Be the first to share it.</p>
          </div>
        )}

        {!isLoadingCurrentProduct && !error && notes.length > 0 && (
          <div>
            <InsightCarousel ariaLabel="Community price note previews" slideWidthClassName="w-[92%]" trackPaddingClassName="px-1">
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
                See all notes
              </button>
            </div>
          </div>
        )}

        {!isLoadingCurrentProduct && !error && submissionEnabled && (
          <div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-4">
            <p className="text-sm leading-5 text-stone-500">Share a price you spotted. It&rsquo;ll be checked before appearing here.</p>
            <button ref={addNoteButtonRef} type="button" onClick={openComposer} className="dd-btn dd-btn-secondary min-h-11 flex-shrink-0 cursor-pointer px-3 text-sm">Add a price note</button>
          </div>
        )}
      </section>
      <NoteComposer
        productId={productId}
        isOpen={composerOpen}
        onClose={closeComposer}
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
