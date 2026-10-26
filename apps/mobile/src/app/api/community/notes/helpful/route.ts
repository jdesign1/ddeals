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

async function readNoteId(request: Request): Promise<string | null> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return null;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) return null;
    const payload = JSON.parse(rawBody) as { noteId?: unknown };
    return typeof payload.noteId === "string" ? payload.noteId.trim() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  return updateHelpfulVote(request, true);
}

export async function DELETE(request: Request) {
  return updateHelpfulVote(request, false);
}

async function updateHelpfulVote(request: Request, helpful: boolean) {
  const token = getBearerToken(request);
  if (!token) return errorResponse("Log in to rate a shopper tip.", 401);

  const account = await getAuthenticatedAccount(token);
  if (!account) return errorResponse("Your sign-in has expired. Please log in again.", 401);
  if (account.is_anonymous) return errorResponse("Log in with an account to rate a shopper tip.", 403);

  const noteId = await readNoteId(request);
  if (!noteId || !isUuid(noteId)) return errorResponse("That tip could not be recognised.", 400);

  try {
    const accounts = requireAccountsAdmin();
    const { data, error } = await accounts.rpc("set_community_note_helpful", {
      p_note_id: noteId,
      p_voter_id: account.id,
      p_helpful: helpful,
    });
    if (error) {
      if (error.code === "P0002") return errorResponse("That tip is no longer available.", 404);
      if (error.code === "P0003") return errorResponse("You can't rate your own tip.", 400);
      if (error.code === "P0004") return errorResponse("You’ve reached today’s helpful-vote limit. Please try again tomorrow.", 429);
      if (error.code === "P0005") return errorResponse("Please verify your account before rating shopper tips.", 403);
      throw error;
    }
    const state = Array.isArray(data) ? data[0] : data;
    if (!state || !Number.isFinite(Number(state.helpful_count)) || typeof state.viewer_has_helpful_vote !== "boolean") {
      throw new Error("Helpful vote state was not returned.");
    }
    return Response.json({
      helpful_count: Number(state.helpful_count),
      viewer_has_helpful_vote: state.viewer_has_helpful_vote,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community helpful vote failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("We couldn't update that helpful vote right now. Please try again.", 503);
  }
}
