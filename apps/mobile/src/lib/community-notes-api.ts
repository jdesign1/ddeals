export interface CommunityPriceNote {
  id: string;
  product_id: string;
  source_store_id: string | null;
  store_name: string | null;
  price: number | null;
  observed_on: string | null;
  region_code: string | null;
  body: string | null;
  author_display_name_snapshot: string;
  helpful_count: number;
  published_at: string | null;
  created_at: string;
}

export interface CommunityPriceNotesResult {
  available: boolean;
  notes: CommunityPriceNote[];
  submissionsEnabled: boolean;
}

export interface SubmitCommunityPriceNoteInput {
  productId: string;
  sourceStoreId?: string;
  price?: string;
  observedOn?: string;
  regionCode?: string;
  body: string;
}

export type CommunityNoteReportReason = "spam" | "wrong_price" | "abuse" | "personal_information" | "other";

export interface CommunityNoteReportInput {
  noteId: string;
  reason: CommunityNoteReportReason;
  details: string;
}

export async function fetchCommunityPriceNotes(
  productId: string,
  limit = 3,
  signal?: AbortSignal,
  accessToken?: string,
): Promise<CommunityPriceNotesResult> {
  const response = await fetch(`/api/community/notes?productId=${encodeURIComponent(productId)}&limit=${limit}`, {
    cache: "no-store",
    signal,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const payload = (await response.json().catch(() => null)) as
    | { available?: boolean; notes?: CommunityPriceNote[]; submissions_enabled?: boolean; error?: string }
    | null;
  if (response.status === 503 && payload?.available === false) return { available: false, notes: [], submissionsEnabled: false };
  if (!response.ok) throw new Error(payload?.error ?? "Community tips are unavailable right now.");
  return {
    available: payload?.available !== false,
    notes: Array.isArray(payload?.notes) ? payload.notes : [],
    submissionsEnabled: payload?.submissions_enabled === true,
  };
}

export async function submitCommunityPriceNote(
  input: SubmitCommunityPriceNoteInput,
  accessToken: string,
): Promise<{ status: "pending" }> {
  const response = await fetch("/api/community/notes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { status?: "pending"; error?: string; message?: string }
    | null;
  if (!response.ok) throw new Error(payload?.error ?? "We couldn't send your note right now. Please try again.");
  if (payload?.status !== "pending") throw new Error("We couldn't confirm your note was sent. Please try again.");
  return { status: "pending" };
}

async function postCommunityAction<T extends object>(path: string, input: T, accessToken: string): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "We couldn't complete that request right now.");
}

export function reportCommunityPriceNote(input: CommunityNoteReportInput, accessToken: string): Promise<void> {
  return postCommunityAction("/api/community/notes/report", input, accessToken);
}

export function blockCommunityNote(noteId: string, accessToken: string): Promise<void> {
  return postCommunityAction("/api/community/notes/block", { noteId }, accessToken);
}
