import { getAuthenticatedAccount, isUuid, requireAccountsAdmin } from "@/lib/accounts-server";
import {
  parseCommunityAutoApprovalMode,
} from "@/lib/community-auto-approval";
import { moderateCommunityNoteBody } from "@/lib/community-content-moderation";
import { MAX_REQUEST_BYTES, parseCommunityNoteInput } from "@/lib/community-note-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const AUTO_APPROVAL_MODE = parseCommunityAutoApprovalMode(process.env.COMMUNITY_NOTES_AUTO_APPROVAL_MODE);

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

async function readPayload(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return null;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) return null;
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function authenticate(request: Request) {
  const token = getBearerToken(request);
  if (!token) return { error: errorResponse("Log in to manage your community tip.", 401) } as const;
  const account = await getAuthenticatedAccount(token);
  if (!account) return { error: errorResponse("Your sign-in has expired. Please log in again.", 401) } as const;
  if (account.is_anonymous) return { error: errorResponse("Log in with an account to manage your community tip.", 403) } as const;
  return { account } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await context.params;
  if (!isUuid(noteId)) return errorResponse("That tip could not be recognised.", 400);

  const auth = await authenticate(request);
  if ("error" in auth) return auth.error;
  const payload = await readPayload(request);
  if (!payload) return errorResponse("Please check the details and try again.", 400);

  const parsedInput = parseCommunityNoteInput(payload);
  if (!parsedInput.ok) return errorResponse(parsedInput.message, parsedInput.status);

  const hasCompletePriceEvidence = parsedInput.value.sourceStoreId !== null
    && parsedInput.value.price !== null
    && parsedInput.value.observedOn !== null;
  if (!parsedInput.value.body && !hasCompletePriceEvidence) {
    return errorResponse("Add a short tip, or add the supermarket, price and date so there’s something useful to share.", 400);
  }

  const contentModeration = moderateCommunityNoteBody(parsedInput.value.body);
  if (contentModeration.decision === "block") {
    return errorResponse("We couldn’t update this tip because it contains language or information we can’t publish. Please remove links, contact details, or inappropriate language, then try again.", 422);
  }

  try {
    const accounts = requireAccountsAdmin();
    const { data, error } = await accounts.rpc("update_community_price_note", {
      p_note_id: noteId,
      p_author_id: auth.account.id,
      p_source_store_id: parsedInput.value.sourceStoreId,
      p_price: parsedInput.value.price,
      p_observed_on: parsedInput.value.observedOn,
      p_region_code: parsedInput.value.regionCode,
      p_body: parsedInput.value.body,
      p_automated_decision: contentModeration.decision === "review" ? "review" : "allowed",
      p_automated_reason: contentModeration.labels.length > 0
        ? `author_edit,${contentModeration.labels.join(",")}`
        : "author_edit",
      p_automated_mode: AUTO_APPROVAL_MODE,
    });
    if (error) {
      if (error.code === "P0001" || /rate limit/i.test(error.message)) {
        return errorResponse("You have made a few tip changes recently. Please try again later.", 429);
      }
      if (error.code === "P0002") return errorResponse("That tip is no longer available to edit.", 404);
      if (error.code === "P0003") return errorResponse("You can only edit your own community tips.", 403);
      if (error.code === "P0004" || error.code === "23505") return errorResponse("You have already shared this tip.", 409);
      throw error;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.status !== "pending") throw new Error("Updated tip status was not returned.");
    return Response.json({ ok: true, status: "pending", message: "Your tip was updated and is waiting for review." }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community note update failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("We couldn't update your tip right now. Please try again.", 503);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await context.params;
  if (!isUuid(noteId)) return errorResponse("That tip could not be recognised.", 400);

  const auth = await authenticate(request);
  if ("error" in auth) return auth.error;

  try {
    const accounts = requireAccountsAdmin();
    const { error } = await accounts.rpc("delete_community_price_note", {
      p_note_id: noteId,
      p_author_id: auth.account.id,
    });
    if (error) {
      if (error.code === "P0001" || /rate limit/i.test(error.message)) {
        return errorResponse("You have made a few tip changes recently. Please try again later.", 429);
      }
      if (error.code === "P0002") return errorResponse("That tip is no longer available to remove.", 404);
      if (error.code === "P0003") return errorResponse("You can only remove your own community tips.", 403);
      throw error;
    }
    return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community note removal failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("We couldn't remove your tip right now. Please try again.", 503);
  }
}
