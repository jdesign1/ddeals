import { createSupabaseClient, type User } from "@dodgey-deals/shared";
import { getAuthenticatedAccount, isUuid, requireAccountsAdmin } from "@/lib/accounts-server";
import {
  COMMUNITY_AUTO_APPROVAL_RULES_VERSION,
  hasCompletePriceEvidence,
  isAccountOldEnoughForCommunityAutoApproval,
  parseCommunityAutoApprovalMode,
  shouldAutoApproveCommunityNote,
} from "@/lib/community-auto-approval";
import { moderateCommunityNoteBody } from "@/lib/community-content-moderation";
import { supabaseConfig } from "@/lib/config";
import {
  BLOCKED_NOTE_MESSAGE,
  MAX_REQUEST_BYTES,
  parseCommunityNoteInput,
} from "@/lib/community-note-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const PREVIEW_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" };
const MAX_PREVIEW_NOTES = 3;
const MAX_NOTES_REQUEST = 50;
const SUBMISSION_ENABLED = process.env.COMMUNITY_NOTES_SUBMISSION_ENABLED === "true";
const AUTO_APPROVAL_MODE = parseCommunityAutoApprovalMode(process.env.COMMUNITY_NOTES_AUTO_APPROVAL_MODE);
const AUTO_APPROVAL_PROVIDER = COMMUNITY_AUTO_APPROVAL_RULES_VERSION;

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? MAX_PREVIEW_NOTES);
  if (!Number.isInteger(parsed) || parsed < 1) return MAX_PREVIEW_NOTES;
  return Math.min(parsed, MAX_NOTES_REQUEST);
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function isTrustedCommunityContributor(
  accounts: ReturnType<typeof requireAccountsAdmin>,
  account: User,
): Promise<boolean> {
  if (
    account.is_anonymous
    || !account.email_confirmed_at
    || !isAccountOldEnoughForCommunityAutoApproval(account.created_at)
  ) {
    return false;
  }

  try {
    const { count, error } = await accounts
      .from("community_price_notes")
      .select("id", { count: "exact", head: true })
      .eq("author_id", account.id)
      .in("status", ["rejected", "hidden"]);
    if (error) throw error;
    return (count ?? 0) === 0;
  } catch (error) {
    // A failed trust check must only fall back to human review, not block the
    // shopper from submitting a useful tip.
    console.warn("Community auto-approval trust check failed.", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

function jsonError(message: string, status: number, extraHeaders: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId")?.trim() ?? "";
  if (!isUuid(productId)) {
    return Response.json({ error: "Invalid product." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const accounts = requireAccountsAdmin();
    const token = getBearerToken(request);
    const account = token ? await getAuthenticatedAccount(token) : null;
    const viewerId = account && !account.is_anonymous ? account.id : null;
    let blockedIds: string[] = [];

    if (viewerId) {
      const { data: blocks, error: blockError } = await accounts
        .from("community_user_blocks")
        .select("blocked_id")
        .eq("blocker_id", viewerId);
      if (blockError) throw blockError;
      blockedIds = (blocks ?? []).map((block) => block.blocked_id).filter(isUuid);
    }

    const notesQuery = accounts
      .from("community_price_notes")
      .select(
        "id,product_id,source_store_id,store_name,price,observed_on,region_code,body,author_id,author_display_name_snapshot,helpful_count,published_at,created_at,status"
      )
      .eq("product_id", productId)
      .eq("status", "approved")
      .not("published_at", "is", null)
      .order("observed_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    const { data, error } = await notesQuery.limit(parseLimit(url.searchParams.get("limit")));

    if (error) throw error;
    const pendingOwnNotes = viewerId
      ? await accounts
        .from("community_price_notes")
        .select(
          "id,product_id,source_store_id,store_name,price,observed_on,region_code,body,author_id,author_display_name_snapshot,helpful_count,published_at,created_at,status"
        )
        .eq("product_id", productId)
        .eq("author_id", viewerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(MAX_NOTES_REQUEST)
      : { data: [], error: null };
    if (pendingOwnNotes.error) throw pendingOwnNotes.error;

    const visibleApprovedNotes = (data ?? []).filter((note) => !note.author_id || !blockedIds.includes(note.author_id));
    const visibleNotes = Array.from(new Map(
      [...(pendingOwnNotes.data ?? []), ...visibleApprovedNotes].map((note) => [note.id, note]),
    ).values());
    const viewerVotedNoteIds = new Set<string>();
    const approvedNoteIds = visibleNotes.filter((note) => note.status === "approved").map((note) => note.id);
    if (viewerId && approvedNoteIds.length > 0) {
      const { data: votes, error: votesError } = await accounts
        .from("community_note_helpful_votes")
        .select("note_id")
        .eq("voter_id", viewerId)
        .in("note_id", approvedNoteIds);
      if (votesError) throw votesError;
      for (const vote of votes ?? []) viewerVotedNoteIds.add(vote.note_id);
    }

    const notes = visibleNotes.map((note) => {
      const { author_id, ...publicNote } = note;
      return {
        ...publicNote,
        price: note.price === null ? null : Number(note.price),
        helpful_count: Number(note.helpful_count),
        viewer_has_helpful_vote: viewerVotedNoteIds.has(note.id),
        is_own_note: Boolean(viewerId && author_id === viewerId),
      };
    });
    return Response.json({ available: true, notes, submissions_enabled: SUBMISSION_ENABLED }, { headers: token ? NO_STORE_HEADERS : PREVIEW_CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not configured|community_price_notes|PGRST205|42P01/i.test(message)) {
      return Response.json({ available: false, notes: [] }, { status: 503, headers: NO_STORE_HEADERS });
    }
    console.error("Community notes request failed.", error instanceof Error ? error.message : "Unknown error");
    return Response.json(
      { error: "Community notes are unavailable right now." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  if (!SUBMISSION_ENABLED) return jsonError("Community notes are not open for submissions yet.", 404);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonError("That note is too large. Please shorten it and try again.", 413);
  }

  const token = getBearerToken(request);
  if (!token) return jsonError("Log in to share a community tip.", 401);

  const account = await getAuthenticatedAccount(token);
  if (!account) return jsonError("Your sign-in has expired. Please log in again.", 401);
  if (account.is_anonymous) return jsonError("Log in with an account to share a community tip.", 403);

  let payload: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonError("That note is too large. Please shorten it and try again.", 413);
    }
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    payload = parsed as Record<string, unknown>;
  } catch {
    return jsonError("Please check the details and try again.", 400);
  }

  const productId = typeof payload.productId === "string" ? payload.productId.trim() : "";
  if (!isUuid(productId)) return jsonError("That product could not be recognised.", 400);
  const parsedInput = parseCommunityNoteInput(payload);
  if (!parsedInput.ok) return jsonError(parsedInput.message, parsedInput.status);
  const { sourceStoreId, price, observedOn, regionCode, body } = parsedInput.value;
  const hasCompletePriceEvidenceValue = hasCompletePriceEvidence(sourceStoreId, price, observedOn);
  if (!body && !hasCompletePriceEvidenceValue) {
    return jsonError("Add a short tip, or add the supermarket, price and date so there’s something useful to share.", 400);
  }

  const contentModeration = moderateCommunityNoteBody(body);
  if (contentModeration.decision === "block") return jsonError(BLOCKED_NOTE_MESSAGE, 422);

  try {
    const accounts = requireAccountsAdmin();
    const trustedAccount = AUTO_APPROVAL_MODE === "active"
      ? await isTrustedCommunityContributor(accounts, account)
      : false;
    const autoApprove = shouldAutoApproveCommunityNote({
      mode: AUTO_APPROVAL_MODE,
      decision: contentModeration.decision,
      trustedAccount,
      hasCompletePriceEvidence: hasCompletePriceEvidenceValue,
    });
    if (!supabaseConfig.url || !supabaseConfig.anonKey) throw new Error("Catalogue is not configured");
    const catalogue = createSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
    const { data: product, error: productError } = await catalogue
      .from("products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return jsonError("That product could not be found.", 400);

    const { data: submission, error } = await accounts.rpc("submit_community_price_note", {
      p_author_id: account.id,
      p_product_id: productId,
      p_source_store_id: sourceStoreId,
      p_price: price,
      p_observed_on: observedOn,
      p_region_code: regionCode,
      p_body: body,
      p_automated_decision: contentModeration.decision === "review" ? "review" : "allowed",
      p_automated_reason: contentModeration.labels.length > 0 ? contentModeration.labels.join(",") : null,
      p_automated_mode: AUTO_APPROVAL_MODE,
      p_auto_approve: autoApprove,
    });
    if (error) {
      if (error.code === "P0001" || /rate limit/i.test(error.message)) {
        return jsonError("You have shared a few notes recently. Please try again later.", 429, { "Retry-After": "3600" });
      }
      if (error.code === "P0002" || error.code === "23505" || /duplicate key/i.test(error.message)) {
        return jsonError("You have already shared this tip.", 409);
      }
      throw error;
    }

    const submissionStatus = Array.isArray(submission) && submission[0]?.status === "approved" ? "approved" : "pending";

    return Response.json(
      {
        ok: true,
        status: submissionStatus,
        message: submissionStatus === "approved"
          ? "Thanks — your tip is live for other shoppers."
          : "Thanks — your tip is queued for review.",
        moderation_provider: AUTO_APPROVAL_PROVIDER,
      },
      { status: submissionStatus === "approved" ? 200 : 202, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/23505|duplicate key/i.test(message)) return jsonError("You have already shared this tip.", 409);
    if (/not configured|community_price_notes|PGRST205|42P01/i.test(message)) {
      return Response.json({ available: false }, { status: 503, headers: NO_STORE_HEADERS });
    }
    console.error("Community note submission failed.", error instanceof Error ? error.message : "Unknown error");
    return jsonError("We couldn't send your note right now. Please try again.", 503);
  }
}
