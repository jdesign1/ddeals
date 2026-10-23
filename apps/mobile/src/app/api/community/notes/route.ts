import { createSupabaseClient } from "@dodgey-deals/shared";
import { getAuthenticatedAccount, isUuid, requireAccountsAdmin } from "@/lib/accounts-server";
import { moderateCommunityNoteBody } from "@/lib/community-content-moderation";
import { supabaseConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const PREVIEW_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" };
const MAX_PREVIEW_NOTES = 3;
const MAX_NOTES_REQUEST = 50;
const MAX_NOTE_BODY_LENGTH = 500;
const MAX_NOTE_AGE_DAYS = 365;
const MAX_REQUEST_BYTES = 8192;
const SUBMISSION_ENABLED = process.env.COMMUNITY_NOTES_SUBMISSION_ENABLED === "true";

const STORE_NAMES: Record<string, string> = {
  newworld: "New World",
  paknsave: "PAK'nSAVE",
  woolworths: "Woolworths",
  foursquare: "Four Square",
  supervalue: "SuperValue",
  chemistwarehouse: "Chemist Warehouse",
};

const REGION_CODES = new Set([
  "northland",
  "auckland",
  "waikato",
  "bay_of_plenty",
  "gisborne",
  "hawkes_bay",
  "taranaki",
  "manawatu_whanganui",
  "wellington",
  "tasman",
  "nelson",
  "marlborough",
  "west_coast",
  "canterbury",
  "otago",
  "southland",
]);

const CONTENT_RESTRICTIONS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const BLOCKED_NOTE_MESSAGE = "We couldn’t send this tip. It may contain language or information we can’t publish. Please remove links, contact details, or inappropriate language, then try again.";

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

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parsePrice(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100000) return undefined;
  if (Math.abs(raw * 100 - Math.round(raw * 100)) > 0.0001) return undefined;
  return Math.round(raw * 100) / 100;
}

function parseBody(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length > MAX_NOTE_BODY_LENGTH || CONTENT_RESTRICTIONS.test(trimmed)) return undefined;
  return trimmed || null;
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
        "id,product_id,source_store_id,store_name,price,observed_on,region_code,body,author_id,author_display_name_snapshot,helpful_count,published_at,created_at"
      )
      .eq("product_id", productId)
      .eq("status", "approved")
      .not("published_at", "is", null)
      .order("observed_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    const { data, error } = await notesQuery.limit(parseLimit(url.searchParams.get("limit")));

    if (error) throw error;
    const notes = (data ?? []).filter((note) => !note.author_id || !blockedIds.includes(note.author_id)).map((note) => {
      const { author_id, ...publicNote } = note;
      void author_id;
      return {
        ...publicNote,
        price: note.price === null ? null : Number(note.price),
        helpful_count: Number(note.helpful_count),
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
  const sourceStoreId = payload.sourceStoreId === null || payload.sourceStoreId === undefined || payload.sourceStoreId === ""
    ? null
    : typeof payload.sourceStoreId === "string"
      ? payload.sourceStoreId.trim().toLowerCase()
      : undefined;
  const observedOn = payload.observedOn === null || payload.observedOn === undefined || payload.observedOn === ""
    ? null
    : typeof payload.observedOn === "string"
      ? payload.observedOn.trim()
      : undefined;
  const regionCode = payload.regionCode === null || payload.regionCode === undefined || payload.regionCode === ""
    ? null
    : typeof payload.regionCode === "string"
      ? payload.regionCode.trim().toLowerCase()
      : undefined;
  const body = parseBody(payload.body);
  const price = parsePrice(payload.price);
  const today = nzToday();

  if (!isUuid(productId)) return jsonError("That product could not be recognised.", 400);
  if (sourceStoreId === undefined || (sourceStoreId !== null && !STORE_NAMES[sourceStoreId])) {
    return jsonError("Choose a supermarket from the list.", 400);
  }
  if (price === undefined) return jsonError("Enter a valid price with up to two decimal places.", 400);
  if (observedOn === undefined) return jsonError("Choose a valid date.", 400);
  if (observedOn !== null) {
    if (!validDate(observedOn)) return jsonError("Choose a valid date.", 400);
    if (observedOn > today) return jsonError("The date cannot be in the future.", 400);
    const oldestAllowed = new Date(`${today}T00:00:00Z`);
    oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - MAX_NOTE_AGE_DAYS);
    if (Date.parse(`${observedOn}T00:00:00Z`) < oldestAllowed.getTime()) {
      return jsonError("Please choose a date within the last year.", 400);
    }
  }
  if (regionCode !== null && (regionCode === undefined || !REGION_CODES.has(regionCode))) {
    return jsonError("Choose a region from the list.", 400);
  }
  if (body === undefined) {
    const rawBody = typeof payload.body === "string" ? payload.body.trim() : "";
    if (rawBody.length > MAX_NOTE_BODY_LENGTH) return jsonError("Shorten your note to 500 characters or fewer.", 400);
    return jsonError(BLOCKED_NOTE_MESSAGE, 422);
  }
  const hasCompletePriceEvidence = sourceStoreId !== null && price !== null && observedOn !== null;
  if (!body && !hasCompletePriceEvidence) {
    return jsonError("Add a short tip, or add the supermarket, price and date so there’s something useful to share.", 400);
  }

  const contentModeration = moderateCommunityNoteBody(body);
  if (contentModeration.decision === "block") return jsonError(BLOCKED_NOTE_MESSAGE, 422);

  try {
    const accounts = requireAccountsAdmin();
    if (!supabaseConfig.url || !supabaseConfig.anonKey) throw new Error("Catalogue is not configured");
    const catalogue = createSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
    const { data: product, error: productError } = await catalogue
      .from("products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return jsonError("That product could not be found.", 400);

    const { error } = await accounts.rpc("submit_community_price_note", {
      p_author_id: account.id,
      p_product_id: productId,
      p_source_store_id: sourceStoreId,
      p_price: price,
      p_observed_on: observedOn,
      p_region_code: regionCode,
      p_body: body,
      p_automated_decision: contentModeration.decision === "review" ? "review" : "allowed",
      p_automated_reason: contentModeration.labels.length > 0 ? contentModeration.labels.join(",") : null,
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

    return Response.json(
      { ok: true, status: "pending", message: "Thanks — your tip was sent for review." },
      { status: 202, headers: NO_STORE_HEADERS },
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
