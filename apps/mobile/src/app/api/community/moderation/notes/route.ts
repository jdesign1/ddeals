import { getAuthenticatedAccount, isUuid, requireAccountsAdmin } from "@/lib/accounts-server";
import { isCommunityModerator } from "@/lib/community-moderation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const MAX_REQUEST_BYTES = 8192;
const MAX_QUEUE_SIZE = 50;
const MAX_REASON_LENGTH = 500;
const ACTIONS = new Set(["approve", "reject", "hide", "dismiss_report"]);

type QueuePointer = { createdAt: string; id: string };
type QueueCursor = {
  pending: QueuePointer | null;
  pendingDone: boolean;
  reports: QueuePointer | null;
  reportsDone: boolean;
};

function parseCursor(value: string | null): QueueCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<QueueCursor>;
    const isValidPointer = (pointer: unknown): pointer is QueuePointer => {
      if (pointer === null) return true;
      if (!pointer || typeof pointer !== "object") return false;
      const candidate = pointer as Partial<QueuePointer>;
      return typeof candidate.createdAt === "string" && Number.isFinite(Date.parse(candidate.createdAt)) && isUuid(candidate.id);
    };
    if (typeof parsed.pendingDone !== "boolean" || typeof parsed.reportsDone !== "boolean" || !isValidPointer(parsed.pending) || !isValidPointer(parsed.reports)) return null;
    return { pending: parsed.pending ?? null, pendingDone: parsed.pendingDone, reports: parsed.reports ?? null, reportsDone: parsed.reportsDone };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: QueueCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

async function getModerator(request: Request) {
  const token = getBearerToken(request);
  if (!token) return { account: null, response: errorResponse("Log in to access moderation tools.", 401) };
  const account = await getAuthenticatedAccount(token);
  if (!account) return { account: null, response: errorResponse("Your sign-in has expired. Please log in again.", 401) };
  if (!(await isCommunityModerator(account))) return { account: null, response: errorResponse("You don't have access to moderation tools.", 403) };
  return { account, response: null };
}

export async function GET(request: Request) {
  const { account, response } = await getModerator(request);
  if (response || !account) return response;

  try {
    const accounts = requireAccountsAdmin();
    const cursor = parseCursor(new URL(request.url).searchParams.get("cursor"));
    const reportsDone = cursor?.reportsDone ?? false;
    const includePending = reportsDone;
    const pendingQuery = accounts
      .from("community_price_notes")
      .select("id,product_id,source_store_id,store_name,price,observed_on,region_code,body,author_id,author_display_name_snapshot,status,created_at,published_at,moderation_reason,moderated_at,automated_moderation_decision,automated_moderation_reason,automated_moderation_provider,automated_moderation_checked_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(includePending ? MAX_QUEUE_SIZE + 1 : 1);
    if (cursor?.pending) pendingQuery.or(`created_at.gt.${cursor.pending.createdAt},and(created_at.eq.${cursor.pending.createdAt},id.gt.${cursor.pending.id})`);
    const { data: pendingNotes, error: pendingError } = cursor?.pendingDone
      ? { data: [], error: null }
      : await pendingQuery;
    if (pendingError) throw pendingError;

    const pendingAvailable = (pendingNotes ?? []).length > 0;
    const pendingPage = includePending ? (pendingNotes ?? []).slice(0, MAX_QUEUE_SIZE) : [];
    const pendingHasMore = includePending && (pendingNotes ?? []).length > MAX_QUEUE_SIZE;
    const pendingCursor = pendingHasMore && pendingPage.length > 0
      ? { createdAt: pendingPage[pendingPage.length - 1].created_at, id: pendingPage[pendingPage.length - 1].id }
      : null;

    const reportsQuery = accounts
      .from("community_note_reports")
      .select("id,note_id,reason,status,details,created_at")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_QUEUE_SIZE + 1);
    if (cursor?.reports) reportsQuery.or(`created_at.gt.${cursor.reports.createdAt},and(created_at.eq.${cursor.reports.createdAt},id.gt.${cursor.reports.id})`);
    const { data: openReports, error: openReportsError } = cursor?.reportsDone
      ? { data: [], error: null }
      : await reportsQuery;
    if (openReportsError) throw openReportsError;

    const reportPage = (openReports ?? []).slice(0, MAX_QUEUE_SIZE);
    const reportsHaveMore = (openReports ?? []).length > MAX_QUEUE_SIZE;
    const reportsCursor = reportsHaveMore && reportPage.length > 0
      ? { createdAt: reportPage[reportPage.length - 1].created_at, id: reportPage[reportPage.length - 1].id }
      : null;
    const reportedNoteIds = reportPage.map((report) => report.note_id).filter(isUuid);
    const { data: reportedNotes, error: reportedNotesError } = reportedNoteIds.length > 0
      ? await accounts
        .from("community_price_notes")
        .select("id,product_id,source_store_id,store_name,price,observed_on,region_code,body,author_id,author_display_name_snapshot,status,created_at,published_at,moderation_reason,moderated_at,automated_moderation_decision,automated_moderation_reason,automated_moderation_provider,automated_moderation_checked_at")
        .in("id", reportedNoteIds)
        .in("status", ["approved", "hidden"])
      : { data: [], error: null };
    if (reportedNotesError) throw reportedNotesError;

    const notes = [...(reportedNotes ?? []), ...pendingPage].filter((note, index, all) => all.findIndex((candidate) => candidate.id === note.id) === index);
    const noteIds = notes.map((note) => note.id).filter(isUuid);
    const { data: reports, error: reportsError } = noteIds.length > 0
      ? await accounts
        .from("community_note_reports")
        .select("id,note_id,reason,status,details,created_at")
        .in("note_id", noteIds)
        .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (reportsError) throw reportsError;

    const reportsByNote = new Map<string, typeof reports>();
    for (const report of reports ?? []) {
      const current = reportsByNote.get(report.note_id) ?? [];
      current.push(report);
      reportsByNote.set(report.note_id, current);
    }

    const safeNotes = (notes ?? []).map((note) => ({
      ...note,
      price: Number(note.price),
      report_count: (reportsByNote.get(note.id) ?? []).filter((report) => report.status === "open").length,
      reports: reportsByNote.get(note.id) ?? [],
    }));
    const nextCursor = pendingHasMore || reportsHaveMore || (!includePending && pendingAvailable)
      ? encodeCursor({
          pending: includePending ? pendingCursor : null,
          pendingDone: includePending ? !pendingHasMore : !pendingAvailable,
          reports: reportsCursor,
          reportsDone: !reportsHaveMore,
        })
      : null;
    const nextQueue = reportsHaveMore ? "reports" : pendingHasMore || (!includePending && pendingAvailable) ? "pending" : null;
    return Response.json({
      notes: safeNotes,
      next_cursor: nextCursor,
      pending_waiting: !includePending && pendingAvailable,
      next_queue: nextQueue,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community moderation queue failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("The moderation queue is unavailable right now.", 503);
  }
}

export async function POST(request: Request) {
  const { account, response } = await getModerator(request);
  if (response || !account) return response;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse("That moderation request is too large.", 413);
  }

  let payload: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) throw new Error("too large");
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid payload");
    payload = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("Please check the moderation action and try again.", 400);
  }

  const noteId = typeof payload.noteId === "string" ? payload.noteId.trim() : "";
  const action = typeof payload.action === "string" ? payload.action.trim() : "";
  const reportId = typeof payload.reportId === "string" ? payload.reportId.trim() : "";
  const reason = payload.reason === undefined || payload.reason === null ? "" : payload.reason;
  if (action !== "dismiss_report" && !isUuid(noteId)) return errorResponse("That note could not be recognised.", 400);
  if (action === "dismiss_report" && !isUuid(reportId)) return errorResponse("That report could not be recognised.", 400);
  if (!ACTIONS.has(action)) return errorResponse("Choose a valid moderation action.", 400);
  if (typeof reason !== "string" || reason.trim().length > MAX_REASON_LENGTH) {
    return errorResponse("Keep the moderation reason under 500 characters.", 400);
  }

  try {
    const accounts = requireAccountsAdmin();
    if (action === "dismiss_report") {
      const { error } = await accounts.rpc("dismiss_community_note_report", {
        p_report_id: reportId,
        p_moderator_id: account.id,
        p_reason: reason.trim() || null,
      });
      if (error) {
        if (error.code === "P0002") return errorResponse("That report is no longer open.", 409);
        throw error;
      }
      return Response.json({ ok: true }, { status: 200, headers: NO_STORE_HEADERS });
    }

    const { data: updated, error } = await accounts.rpc("moderate_community_price_note", {
      p_note_id: noteId,
      p_moderator_id: account.id,
      p_action: action,
      p_reason: reason.trim() || null,
    });
    if (error) {
      if (error.code === "P0002") return errorResponse("That note is no longer in the moderation queue.", 409);
      throw error;
    }

    return Response.json({ ok: true, note: Array.isArray(updated) ? updated[0] ?? null : updated }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community moderation action failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("We couldn't save that moderation action right now.", 503);
  }
}
