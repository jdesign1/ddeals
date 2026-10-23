import { getAuthenticatedAccount, isUuid, requireAccountsAdmin } from "@/lib/accounts-server";
import { CONTACT_SUPPORT_EMAIL } from "@/lib/contact-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const MAX_REQUEST_BYTES = 8192;
const MAX_DETAILS_LENGTH = 500;
const REPORT_REASONS = new Set(["spam", "wrong_price", "abuse", "personal_information", "other"]);

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

async function notifyModerationInbox(noteId: string, reason: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_FORM_FROM_EMAIL;
  const toEmail = process.env.CONTACT_FORM_TO_EMAIL || CONTACT_SUPPORT_EMAIL;
  if (!apiKey || !fromEmail) {
    console.warn("Community report notification is not configured.");
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: "New Dodgy Deal community note report",
        text: [
          "A community price note was reported in Dodgy Deal.",
          `Note ID: ${noteId}`,
          `Reason: ${reason}`,
          "",
          "Review the full report in the secure Community moderation page.",
        ].join("\n"),
      }),
    });
    if (!response.ok) console.error("Community report notification provider rejected the request.", { status: response.status });
  } catch (error) {
    console.error("Community report notification failed.", error instanceof Error ? error.message : "Unknown error");
  }
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return errorResponse("Log in to report a community note.", 401);

  const account = await getAuthenticatedAccount(token);
  if (!account) return errorResponse("Your sign-in has expired. Please log in again.", 401);
  if (account.is_anonymous) return errorResponse("Log in with an account to report a community note.", 403);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse("That report is too large. Please shorten it and try again.", 413);
  }

  let payload: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) throw new Error("too large");
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid payload");
    payload = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("Please check the report details and try again.", 400);
  }

  const noteId = typeof payload.noteId === "string" ? payload.noteId.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const details = payload.details === undefined || payload.details === null ? "" : payload.details;
  if (!isUuid(noteId)) return errorResponse("That note could not be recognised.", 400);
  if (!REPORT_REASONS.has(reason)) return errorResponse("Choose a report reason.", 400);
  if (typeof details !== "string" || details.trim().length > MAX_DETAILS_LENGTH) {
    return errorResponse("Keep the report details under 500 characters.", 400);
  }

  try {
    const accounts = requireAccountsAdmin();
    const { error } = await accounts.rpc("submit_community_note_report", {
      p_note_id: noteId,
      p_reporter_id: account.id,
      p_reason: reason,
      p_details: details.trim() || null,
    });
    if (error) {
      if (error.code === "P0001" || /rate limit/i.test(error.message)) {
        return errorResponse("You have sent a few reports recently. Please try again tomorrow.", 429);
      }
      if (error.code === "P0002") return errorResponse("That note is no longer available to report.", 404);
      if (error.code === "P0003" || error.code === "23505" || /duplicate key/i.test(error.message)) {
        return errorResponse("You have already reported this note.", 409);
      }
      throw error;
    }

    await notifyModerationInbox(noteId, reason);
    return Response.json({ ok: true }, { status: 202, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community note report failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("We couldn't send that report right now. Please try again.", 503);
  }
}
