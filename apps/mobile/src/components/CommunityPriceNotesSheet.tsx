"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CommunityNoteAuthor from "@/components/CommunityNoteAuthor";
import { useAuth } from "@/lib/auth-context";
import {
  blockCommunityNote,
  fetchCommunityPriceNotes,
  reportCommunityPriceNote,
  type CommunityNoteReportReason,
  type CommunityPriceNote,
} from "@/lib/community-notes-api";

const REPORT_OPTIONS: Array<{ value: CommunityNoteReportReason; label: string }> = [
  { value: "abuse", label: "Inappropriate or abusive" },
  { value: "spam", label: "Spam or advertising" },
  { value: "personal_information", label: "Personal information" },
  { value: "wrong_price", label: "Misleading or unrelated" },
  { value: "other", label: "Other" },
];

function formatObservedDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function NoteDetail({ note }: { note: CommunityPriceNote }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <CommunityNoteAuthor note={note} />
      {note.price !== null && <p className="mt-4 font-display text-2xl font-extrabold leading-7 text-stone-900">${note.price.toFixed(2)}</p>}
      {note.store_name && <p className="mt-1 text-sm font-bold text-stone-700">{note.store_name}</p>}
      {note.observed_on && <p className="mt-3 text-xs font-semibold text-stone-500">Seen {formatObservedDate(note.observed_on)}</p>}
      {note.body && <p className="mt-3 text-sm leading-5 text-stone-700">{note.body}</p>}
    </article>
  );
}

export default function CommunityPriceNotesSheet({
  productId,
  isOpen,
  openSequence,
  onClose,
  returnFocusRef,
  onBlocked,
}: {
  productId: string;
  isOpen: boolean;
  openSequence: number;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onBlocked: () => void;
}) {
  const pathname = usePathname();
  const { session, user, isAnonymousSession, openAuthSheet } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstControlRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [notes, setNotes] = useState<CommunityPriceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMenuNoteId, setActionMenuNoteId] = useState<string | null>(null);
  const [reportNoteId, setReportNoteId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<CommunityNoteReportReason>("abuse");
  const [reportDetails, setReportDetails] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "success">("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const [blockNoteId, setBlockNoteId] = useState<string | null>(null);
  const [blockState, setBlockState] = useState<"idle" | "sending">("idle");
  const [blockError, setBlockError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [completedOpenSequence, setCompletedOpenSequence] = useState(-1);
  const showLoading = isOpen && (loading || completedOpenSequence !== openSequence);
  const reportStateRef = useRef(reportState);
  const blockStateRef = useRef(blockState);

  useEffect(() => {
    reportStateRef.current = reportState;
  }, [reportState]);

  useEffect(() => {
    blockStateRef.current = blockState;
  }, [blockState]);

  useEffect(() => {
    if (statusMessage) statusRef.current?.focus();
  }, [statusMessage]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setActionMenuNoteId(null);
      setReportNoteId(null);
      setReportReason("abuse");
      setReportDetails("");
      setReportState("idle");
      setReportError(null);
      setBlockNoteId(null);
      setBlockState("idle");
      setBlockError(null);
      setStatusMessage(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, openSequence]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : returnFocusRef.current;
    const frame = window.requestAnimationFrame(() => firstControlRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (reportStateRef.current !== "sending" && blockStateRef.current !== "sending") onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
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
  }, [isOpen, onClose, returnFocusRef]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchCommunityPriceNotes(productId, 50, controller.signal, session?.access_token)
      .then((result) => {
        setNotes(result.notes);
        setLoading(false);
        setCompletedOpenSequence(openSequence);
      })
      .catch((nextError: unknown) => {
        if (nextError instanceof DOMException && nextError.name === "AbortError") return;
        setError(nextError instanceof Error ? nextError.message : "Community notes are unavailable right now.");
        setLoading(false);
        setCompletedOpenSequence(openSequence);
      });
    return () => controller.abort();
  }, [isOpen, openSequence, productId, retryTick, session?.access_token]);

  function requireAccount(message: string): string | null {
    if (!user || isAnonymousSession || !session?.access_token) {
      openAuthSheet(message, pathname);
      return null;
    }
    return session.access_token;
  }

  function openReport(noteId: string) {
    if (!requireAccount("Log in to report a community note. After signing in, return here and open Actions again.")) return;
    setActionMenuNoteId(noteId);
    setReportNoteId(noteId);
    setReportReason("abuse");
    setReportDetails("");
    setReportState("idle");
    setReportError(null);
    setBlockNoteId(null);
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportNoteId) return;
    const accessToken = requireAccount("Log in to report a community note. After signing in, return here and open Actions again.");
    if (!accessToken) return;
    setReportState("sending");
    setReportError(null);
    try {
      await reportCommunityPriceNote({ noteId: reportNoteId, reason: reportReason, details: reportDetails }, accessToken);
      setReportState("success");
    } catch (nextError) {
      setReportState("idle");
      setReportError(nextError instanceof Error ? nextError.message : "We couldn't send that report right now.");
    }
  }

  function askToBlock(noteId: string) {
    if (!requireAccount("Log in to hide a shopper's notes. After signing in, return here and open Actions again.")) return;
    setActionMenuNoteId(noteId);
    setReportNoteId(null);
    setBlockNoteId(noteId);
    setBlockError(null);
  }

  async function confirmBlock() {
    if (!blockNoteId) return;
    const accessToken = requireAccount("Log in to hide a shopper's notes. After signing in, return here and open Actions again.");
    if (!accessToken) return;
    setBlockState("sending");
    setBlockError(null);
    try {
      await blockCommunityNote(blockNoteId, accessToken);
      setNotes([]);
      setLoading(true);
      setBlockNoteId(null);
      setActionMenuNoteId(null);
      setStatusMessage("This shopper's notes are now hidden from your view.");
      setRetryTick((tick) => tick + 1);
      onBlocked();
    } catch (nextError) {
      setBlockError(nextError instanceof Error ? nextError.message : "We couldn't hide those notes right now.");
    } finally {
      setBlockState("idle");
    }
  }

  return (
    <BottomSheetPortal open={isOpen}>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              onClick={() => { if (reportStateRef.current !== "sending" && blockStateRef.current !== "sending") onClose(); }}
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
              aria-labelledby="community-notes-sheet-title"
              aria-describedby="community-notes-sheet-description"
              ref={dialogRef}
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
            >
              <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <div>
                  <h2 id="community-notes-sheet-title" className="dd-type-sheet-title text-stone-900">Community tips</h2>
                  <p id="community-notes-sheet-description" className="mt-1 text-sm text-stone-500">Helpful tips from other shoppers, separate from our official assessment.</p>
                </div>
                <button
                  type="button"
                  ref={firstControlRef}
                  onClick={onClose}
                  disabled={reportState === "sending" || blockState === "sending"}
                  aria-label="Close community tips"
                  className="dd-bottom-sheet-close text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {statusMessage && !showLoading && <p ref={statusRef} tabIndex={-1} className="mb-4 rounded-xl border border-fair-100 bg-fair-50 p-3 text-sm font-semibold text-fair-950 outline-none" role="status">{statusMessage}</p>}
                {showLoading && <p className="text-sm font-semibold text-stone-600" role="status">Loading community tips…</p>}
                {!showLoading && error && (
                  <div className="rounded-xl border border-alert-100 bg-alert-50 p-4" role="alert">
                    <p className="text-sm font-semibold text-alert-950">{error}</p>
                    <button type="button" onClick={() => { setLoading(true); setError(null); setRetryTick((tick) => tick + 1); }} className="dd-btn dd-btn-outline mt-3 min-h-11 cursor-pointer">Try again</button>
                  </div>
                )}
                {!showLoading && !error && notes.length === 0 && (
                  <p ref={statusRef} tabIndex={-1} className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm font-semibold leading-5 text-stone-700 outline-none">No community tips are available for this product.</p>
                )}
                {!showLoading && !error && notes.length > 0 && (
                  <div className="space-y-4">
                    {notes.map((note) => (
                      <div key={note.id}>
                        <NoteDetail note={note} />
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            aria-label={`Actions for ${note.store_name ?? "community"} note`}
                            aria-controls={`community-note-actions-${note.id}`}
                            aria-expanded={actionMenuNoteId === note.id}
                            onClick={() => setActionMenuNoteId((current) => current === note.id ? null : note.id)}
                            className="min-h-11 rounded-full px-3 text-sm font-bold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
                          >
                            Actions
                          </button>
                        </div>
                        {actionMenuNoteId === note.id && (
                          <div id={`community-note-actions-${note.id}`} className="mt-2 rounded-xl border border-stone-200 bg-white p-3" role="group" aria-label={`Actions for note from ${note.store_name ?? "community"}`}>
                            {reportNoteId === note.id ? (
                              reportState === "success" ? (
                                <div className="space-y-3" role="status">
                                  <p ref={statusRef} tabIndex={-1} className="text-sm font-semibold text-stone-700 outline-none">Thanks — we&rsquo;ll review this report.</p>
                                  <button type="button" onClick={() => setActionMenuNoteId(null)} className="dd-btn dd-btn-outline min-h-11 cursor-pointer">Done</button>
                                </div>
                              ) : (
                                <form onSubmit={submitReport} className="space-y-3">
                                  <div>
                                    <label htmlFor={`community-report-reason-${note.id}`} className="dd-type-meta dd-type-meta-strong text-stone-600">Why are you reporting this note?</label>
                                    <select
                                      id={`community-report-reason-${note.id}`}
                                      value={reportReason}
                                      onChange={(event) => setReportReason(event.target.value as CommunityNoteReportReason)}
                                      className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-800 focus:border-stone-900 focus:outline-none"
                                    >
                                      {REPORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label htmlFor={`community-report-details-${note.id}`} className="dd-type-meta dd-type-meta-strong text-stone-600">More detail <span className="font-normal text-stone-400">(optional)</span></label>
                                    <textarea
                                      id={`community-report-details-${note.id}`}
                                      value={reportDetails}
                                      onChange={(event) => setReportDetails(event.target.value)}
                                      maxLength={500}
                                      rows={3}
                                      className="mt-1 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base leading-5 text-stone-800 focus:border-stone-900 focus:outline-none"
                                    />
                                  </div>
                                  {reportError && <p className="text-sm font-semibold text-alert-600" role="alert">{reportError}</p>}
                                  <div className="flex flex-wrap gap-2">
                                    <button type="submit" disabled={reportState === "sending"} className="dd-btn dd-btn-primary min-h-11 cursor-pointer disabled:opacity-60">{reportState === "sending" ? "Sending…" : "Send report"}</button>
                                    <button type="button" onClick={() => setReportNoteId(null)} disabled={reportState === "sending"} className="dd-btn dd-btn-outline min-h-11 cursor-pointer">Cancel</button>
                                  </div>
                                  <p className="text-xs leading-4 text-stone-500">Need more help? <Link href="/support" className="font-bold underline underline-offset-2">Contact support</Link>.</p>
                                </form>
                              )
                            ) : blockNoteId === note.id ? (
                              <div className="space-y-3">
                                <p className="text-sm leading-5 text-stone-700">Hide this shopper&rsquo;s other notes from your view? This is a persistent setting for your account. <Link href="/support" className="font-bold underline underline-offset-2">Contact support</Link> if you need help changing it.</p>
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" onClick={confirmBlock} disabled={blockState === "sending"} className="dd-btn dd-btn-primary min-h-11 cursor-pointer disabled:opacity-60">{blockState === "sending" ? "Hiding…" : "Hide notes"}</button>
                                  <button type="button" onClick={() => setBlockNoteId(null)} disabled={blockState === "sending"} className="dd-btn dd-btn-outline min-h-11 cursor-pointer">Cancel</button>
                                </div>
                                {blockError && <p className="text-sm font-semibold text-alert-600" role="alert">{blockError}</p>}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => openReport(note.id)} className="dd-btn dd-btn-outline min-h-11 cursor-pointer">Report this note</button>
                                <button type="button" onClick={() => askToBlock(note.id)} className="dd-btn dd-btn-outline min-h-11 cursor-pointer">Hide shopper&rsquo;s notes</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
