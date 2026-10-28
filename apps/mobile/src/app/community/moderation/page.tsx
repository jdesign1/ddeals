"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LoadingMascot from "@/components/LoadingMascot";
import ButtonSpinner from "@/components/ButtonSpinner";
import { useAuth } from "@/lib/auth-context";
import { usePageHeader } from "@/lib/header-context";

type ModerationReport = {
  id: string;
  note_id: string;
  reason: string;
  status: string;
  details: string | null;
  created_at: string;
};

type ModerationNote = {
  id: string;
  store_name: string | null;
  price: number | null;
  observed_on: string | null;
  region_code: string | null;
  body: string | null;
  author_display_name_snapshot: string;
  status: string;
  created_at: string;
  report_count: number;
  reports: ModerationReport[];
  automated_moderation_decision: "not_checked" | "allowed" | "review" | "blocked";
  automated_moderation_reason: string | null;
  automated_moderation_provider: string;
  automated_moderation_mode: "off" | "shadow" | "active";
  publication_method: "human_review" | "automated";
  automated_approved_at: string | null;
};

type ModerationAction = "approve" | "reject" | "hide" | "dismiss_report";

const AUTOMATED_LABELS: Record<string, string> = {
  accusation: "Possible accusation",
  abusive_language: "Abusive language",
  contact_details: "Contact details",
  discrimination: "Possible discrimination",
  excessive_caps: "Excessive capitalisation",
  excessive_punctuation: "Excessive punctuation",
  explicit_content: "Explicit content",
  external_link: "External link",
  promotion: "Promotion or advertising",
  repeated_characters: "Repeated characters",
  repeated_content: "Repeated content",
  self_harm: "Self-harm language",
  violent_threat: "Violent threat",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function CommunityModerationPage() {
  const router = useRouter();
  const { user, loading: authLoading, session, isAnonymousSession, openAuthSheet } = useAuth();
  const [notes, setNotes] = useState<ModerationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<{ action: "reject" | "hide"; noteId: string } | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [nextQueue, setNextQueue] = useState<"reports" | "pending" | null>(null);
  const [pendingWaiting, setPendingWaiting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const accessToken = session?.access_token;
  usePageHeader("Community moderation", () => router.back());

  useEffect(() => {
    if (statusMessage) statusRef.current?.focus();
  }, [statusMessage]);

  const loadQueue = useCallback(async (cursor?: string, append = false) => {
    if (!accessToken || isAnonymousSession) {
      setNotes([]);
      setNextCursor(null);
      setNextQueue(null);
      setPendingWaiting(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const endpoint = cursor ? `/api/community/moderation/notes?cursor=${encodeURIComponent(cursor)}` : "/api/community/moderation/notes";
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => null)) as { notes?: ModerationNote[]; next_cursor?: string | null; next_queue?: "reports" | "pending" | null; pending_waiting?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "The moderation queue is unavailable right now.");
      const fetchedNotes = Array.isArray(payload?.notes) ? payload.notes : [];
      setNotes((current) => append ? [...current, ...fetchedNotes.filter((note) => !current.some((existing) => existing.id === note.id))] : fetchedNotes);
      setNextCursor(payload?.next_cursor ?? null);
      setNextQueue(payload?.next_queue ?? null);
      setPendingWaiting(payload?.pending_waiting === true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The moderation queue is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAnonymousSession]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => { void loadQueue(); }, 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, loadQueue]);

  async function takeAction(action: ModerationAction, noteId: string, reportId?: string) {
    if (!session?.access_token) return;
    if ((action === "reject" || action === "hide") && pendingConfirmation?.noteId !== noteId) {
      setPendingConfirmation({ action, noteId });
      return;
    }
    const key = `${action}:${reportId ?? noteId}`;
    setActionKey(key);
    setError(null);
    try {
      const response = await fetch("/api/community/moderation/notes", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId,
          reportId,
          action,
          reason: reasons[noteId] ?? "",
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "We couldn't save that action right now.");
      const actionLabel = action === "dismiss_report" ? "Report dismissed" : action === "approve" ? "Note approved" : action === "reject" ? "Note rejected" : "Note hidden";
      setStatusMessage(actionLabel);
      setPendingConfirmation(null);
      await loadQueue();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "We couldn't save that action right now.");
    } finally {
      setActionKey(null);
    }
  }

  if (authLoading || (loading && notes.length === 0)) {
    return <main className="px-5 py-6"><LoadingMascot loading /></main>;
  }

  if (!user || isAnonymousSession) {
    return (
      <main className="flex flex-col gap-4 px-5 py-6">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <h1 className="font-display text-2xl font-extrabold leading-7 text-stone-900">Community moderation</h1>
          <p className="mt-3 text-sm leading-5 text-stone-600">Log in with a moderator account to review shopper-submitted notes.</p>
          <button type="button" onClick={() => openAuthSheet("Log in to review community notes.", "/community/moderation")} className="dd-btn dd-btn-primary mt-4 min-h-11 cursor-pointer">Log in</button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 px-5 py-6 pb-10">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
        <h1 className="font-display text-2xl font-extrabold leading-7 text-stone-900">Community moderation</h1>
        <p className="mt-2 text-sm leading-5 text-stone-600">Review notes before they appear publicly. Official deal assessment data is separate from this queue.</p>
      </section>

      {error && (
        <div className="rounded-xl border border-alert-100 bg-alert-50 p-4" role="alert">
          <p className="text-sm font-semibold leading-5 text-alert-950">{error}</p>
          <button type="button" onClick={() => void loadQueue()} className="dd-btn dd-btn-outline mt-3 min-h-11 cursor-pointer">Try again</button>
        </div>
      )}

      {statusMessage && <p ref={statusRef} tabIndex={-1} className="text-sm font-semibold text-stone-700 outline-none" role="status" aria-live="polite">{statusMessage}</p>}

      {!error && notes.length === 0 && pendingWaiting && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5" role="status">
          <p className="text-sm font-semibold text-stone-700">Pending notes are waiting to be reviewed.</p>
          <p className="mt-1 text-sm leading-5 text-stone-500">Open reports are checked first. Use the button below to continue to the pending notes.</p>
        </div>
      )}

      {!error && notes.length === 0 && !pendingWaiting && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5" role="status">
          <p className="text-sm font-semibold text-stone-700">The moderation queue is clear.</p>
        </div>
      )}

      {notes.map((note) => (
        <article key={note.id} aria-labelledby={`moderation-note-${note.id}`} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={`moderation-note-${note.id}`} className="font-display text-2xl font-extrabold leading-7 text-stone-900">{note.price !== null ? `$${note.price.toFixed(2)}` : "A shopper tip"}</h2>
              {(note.store_name || note.observed_on) && (
                <p className="mt-1 text-sm font-bold text-stone-700">
                  {note.store_name ?? "Community note"}{note.store_name && note.observed_on ? " · " : ""}{note.observed_on ? `Seen ${note.observed_on}` : ""}
                </p>
              )}
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold capitalize text-stone-600">{note.status}</span>
          </div>
          <p className="mt-3 text-xs font-semibold text-stone-500">Submitted {formatDate(note.created_at)} · {note.author_display_name_snapshot}</p>
          {note.body && <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm leading-5 text-stone-700">{note.body}</p>}

          <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-stone-500">Automated safety check</p>
            <p className="mt-1 text-sm font-semibold text-stone-700">
              {note.automated_moderation_decision === "review"
                ? "Held for human review"
                : note.publication_method === "automated"
                  ? "Published automatically after passing the safety check"
                  : note.automated_moderation_mode === "shadow" && note.automated_moderation_decision === "allowed"
                    ? "Shadow mode: would be eligible for automatic publishing"
                    : note.automated_moderation_decision === "allowed"
                      ? "No automated issue found — awaiting human review"
                      : "Not checked"}
            </p>
            {note.automated_moderation_reason && <p className="mt-1 text-xs leading-4 text-stone-500">Signals: {note.automated_moderation_reason.split(",").map((label) => AUTOMATED_LABELS[label] ?? label).join(", ")}</p>}
            <p className="mt-1 text-xs text-stone-400">Automated safety rules</p>
          </div>

          <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-stone-500">Reports: {note.report_count}</p>
            {note.reports.filter((report) => report.status === "open").length > 0 ? (
              <div className="mt-2 space-y-2">
                {note.reports.filter((report) => report.status === "open").map((report) => (
                  <div key={report.id} className="rounded-lg border border-stone-200 bg-white p-3">
                    <p className="text-sm font-semibold text-stone-700">{report.reason.replace(/_/g, " ")}</p>
                    {report.details && <p className="mt-1 text-sm leading-5 text-stone-600">{report.details}</p>}
                    <button
                      type="button"
                      onClick={() => void takeAction("dismiss_report", note.id, report.id)}
                      disabled={actionKey === `dismiss_report:${report.id}`}
                      aria-busy={actionKey === `dismiss_report:${report.id}`}
                      className="mt-2 min-h-11 rounded-full px-2 text-sm font-bold text-stone-700 underline decoration-stone-300 underline-offset-4 disabled:opacity-50"
                    >
                      {actionKey === `dismiss_report:${report.id}` && <ButtonSpinner className="mr-1.5 inline-block h-3.5 w-3.5 align-[-0.15em]" />}
                      Dismiss report
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-stone-600">No open reports.</p>
            )}
          </div>

          <label htmlFor={`moderation-reason-${note.id}`} className="mt-4 block text-xs font-bold text-stone-600">Decision note <span className="font-normal text-stone-400">(optional)</span></label>
          <textarea
            id={`moderation-reason-${note.id}`}
            value={reasons[note.id] ?? ""}
            maxLength={500}
            rows={2}
            aria-describedby={`moderation-reason-counter-${note.id}`}
            onChange={(event) => setReasons((current) => ({ ...current, [note.id]: event.target.value }))}
            className="mt-1 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base leading-5 text-stone-800 focus:border-stone-900 focus:outline-none"
          />
          <p id={`moderation-reason-counter-${note.id}`} className="mt-1 text-right text-xs text-stone-400">{(reasons[note.id] ?? "").length}/500</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingConfirmation?.noteId === note.id ? (
              <>
                <p className="basis-full text-sm font-semibold text-stone-700">Confirm {pendingConfirmation.action === "reject" ? "rejecting" : "hiding"} this note?</p>
                <button type="button" onClick={() => void takeAction(pendingConfirmation.action, note.id)} disabled={actionKey !== null} aria-busy={actionKey === `${pendingConfirmation.action}:${note.id}`} className="dd-btn dd-btn-primary min-h-11 cursor-pointer disabled:opacity-50">
                  {actionKey === `${pendingConfirmation.action}:${note.id}` && <ButtonSpinner />}
                  Confirm
                </button>
                <button type="button" onClick={() => setPendingConfirmation(null)} disabled={actionKey !== null} className="dd-btn dd-btn-outline min-h-11 cursor-pointer disabled:opacity-50">Cancel</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void takeAction("approve", note.id)} disabled={actionKey !== null || note.status !== "pending"} aria-busy={actionKey === `approve:${note.id}`} className="dd-btn dd-btn-primary min-h-11 cursor-pointer disabled:opacity-50">
                  {actionKey === `approve:${note.id}` && <ButtonSpinner />}
                  Approve
                </button>
                <button type="button" onClick={() => void takeAction("reject", note.id)} disabled={actionKey !== null || note.status !== "pending"} aria-busy={actionKey === `reject:${note.id}`} className="dd-btn dd-btn-outline min-h-11 cursor-pointer disabled:opacity-50">
                  {actionKey === `reject:${note.id}` && <ButtonSpinner />}
                  Reject
                </button>
                <button type="button" onClick={() => void takeAction("hide", note.id)} disabled={actionKey !== null || note.status !== "approved"} aria-busy={actionKey === `hide:${note.id}`} className="dd-btn dd-btn-outline min-h-11 cursor-pointer disabled:opacity-50">
                  {actionKey === `hide:${note.id}` && <ButtonSpinner />}
                  Hide
                </button>
              </>
            )}
          </div>
          {note.status === "hidden" && <p className="mt-2 text-xs leading-4 text-stone-500">This note is already hidden and cannot be republished from this queue.</p>}
        </article>
      ))}

      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadQueue(nextCursor, true)}
          disabled={loading}
          aria-busy={loading}
          className="dd-btn dd-btn-outline min-h-11 cursor-pointer disabled:opacity-50"
        >
          {loading && <ButtonSpinner />}
          {nextQueue === "reports" ? "Load more reports" : "Load pending notes"}
        </button>
      )}
    </main>
  );
}
