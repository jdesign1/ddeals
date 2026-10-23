import { getAuthenticatedAccount, isUuid, requireAccountsAdmin } from "@/lib/accounts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const MAX_REQUEST_BYTES = 4096;

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return errorResponse("Log in to hide a shopper's notes.", 401);

  const account = await getAuthenticatedAccount(token);
  if (!account) return errorResponse("Your sign-in has expired. Please log in again.", 401);
  if (account.is_anonymous) return errorResponse("Log in with an account to hide a shopper's notes.", 403);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse("That request is too large.", 413);
  }

  let payload: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) throw new Error("too large");
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid payload");
    payload = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("Please try again.", 400);
  }

  const noteId = typeof payload.noteId === "string" ? payload.noteId.trim() : "";
  if (!isUuid(noteId)) return errorResponse("That note could not be recognised.", 400);

  try {
    const accounts = requireAccountsAdmin();
    const { data: note, error: noteError } = await accounts
      .from("community_price_notes")
      .select("id,author_id,status,published_at")
      .eq("id", noteId)
      .maybeSingle();
    if (noteError) throw noteError;
    if (!note || note.status !== "approved" || !note.published_at || !note.author_id) {
      return errorResponse("That note is no longer available.", 404);
    }
    if (note.author_id === account.id) return errorResponse("You can't hide your own note.", 400);

    const { error } = await accounts.from("community_user_blocks").upsert(
      { blocker_id: account.id, blocked_id: note.author_id },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );
    if (error) throw error;

    return Response.json({ ok: true }, { status: 202, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community shopper block failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("We couldn't hide those notes right now. Please try again.", 503);
  }
}
