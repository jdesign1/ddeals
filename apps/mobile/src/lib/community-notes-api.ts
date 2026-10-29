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
  status: "pending" | "approved";
  viewer_has_helpful_vote: boolean;
  is_own_note: boolean;
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

export interface UpdateCommunityPriceNoteInput {
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

export interface CommunityHelpfulVoteResult {
  helpful_count: number;
  viewer_has_helpful_vote: boolean;
}

export interface CommunityProfileSummary {
  tips_shared: number;
  helpful_received: number;
  deal_detective_quiz_correct: number;
  deal_detective_quiz_attempts: number;
  rank: number | null;
  contributor_count: number | null;
  city: string | null;
  favorite_store_branch: string | null;
  profile_quote: string | null;
}

function normaliseCommunityProfileSummary(profile: Partial<CommunityProfileSummary>): CommunityProfileSummary {
  return {
    tips_shared: typeof profile.tips_shared === "number" && Number.isFinite(profile.tips_shared) ? profile.tips_shared : 0,
    helpful_received: typeof profile.helpful_received === "number" && Number.isFinite(profile.helpful_received) ? profile.helpful_received : 0,
    deal_detective_quiz_correct: typeof profile.deal_detective_quiz_correct === "number" && Number.isFinite(profile.deal_detective_quiz_correct) ? profile.deal_detective_quiz_correct : 0,
    deal_detective_quiz_attempts: typeof profile.deal_detective_quiz_attempts === "number" && Number.isFinite(profile.deal_detective_quiz_attempts) ? profile.deal_detective_quiz_attempts : 0,
    rank: typeof profile.rank === "number" && Number.isFinite(profile.rank) ? profile.rank : null,
    contributor_count: typeof profile.contributor_count === "number" && Number.isFinite(profile.contributor_count) ? profile.contributor_count : null,
    city: typeof profile.city === "string" ? profile.city : null,
    favorite_store_branch: typeof profile.favorite_store_branch === "string" ? profile.favorite_store_branch : null,
    profile_quote: typeof profile.profile_quote === "string" ? profile.profile_quote : null,
  };
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
    notes: Array.isArray(payload?.notes)
      ? payload.notes.map((note) => ({
        ...note,
        status: note.status === "pending" ? "pending" : "approved",
        helpful_count: Number.isFinite(note.helpful_count) ? note.helpful_count : 0,
        viewer_has_helpful_vote: note.viewer_has_helpful_vote === true,
        is_own_note: note.is_own_note === true,
      }))
      : [],
    submissionsEnabled: payload?.submissions_enabled === true,
  };
}

export async function submitCommunityPriceNote(
  input: SubmitCommunityPriceNoteInput,
  accessToken: string,
): Promise<{ status: "pending" | "approved" }> {
  const response = await fetch("/api/community/notes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { status?: "pending" | "approved"; error?: string; message?: string }
    | null;
  if (!response.ok) throw new Error(payload?.error ?? "We couldn't send your note right now. Please try again.");
  if (payload?.status !== "pending" && payload?.status !== "approved") {
    throw new Error("We couldn't confirm your note was sent. Please try again.");
  }
  return { status: payload.status };
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

export async function updateCommunityPriceNote(
  noteId: string,
  input: UpdateCommunityPriceNoteInput,
  accessToken: string,
): Promise<{ status: "pending" }> {
  const response = await fetch(`/api/community/notes/${encodeURIComponent(noteId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { status?: "pending"; error?: string }
    | null;
  if (!response.ok) throw new Error(payload?.error ?? "We couldn't update your tip right now. Please try again.");
  if (payload?.status !== "pending") throw new Error("We couldn't confirm your tip was updated. Please try again.");
  return { status: payload.status };
}

export async function deleteCommunityPriceNote(noteId: string, accessToken: string): Promise<void> {
  const response = await fetch(`/api/community/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "We couldn't remove your tip right now. Please try again.");
}

export async function setCommunityPriceNoteHelpful(
  noteId: string,
  helpful: boolean,
  accessToken: string,
): Promise<CommunityHelpfulVoteResult> {
  const response = await fetch("/api/community/notes/helpful", {
    method: helpful ? "POST" : "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ noteId }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { helpful_count?: number; viewer_has_helpful_vote?: boolean; error?: string }
    | null;
  if (!response.ok) throw new Error(payload?.error ?? "We couldn't update that helpful vote right now.");
  if (!Number.isFinite(payload?.helpful_count) || typeof payload?.viewer_has_helpful_vote !== "boolean") {
    throw new Error("We couldn't confirm that helpful vote. Please try again.");
  }
  return {
    helpful_count: Number(payload.helpful_count),
    viewer_has_helpful_vote: payload.viewer_has_helpful_vote,
  };
}

export async function fetchCommunityProfileSummary(
  accessToken: string,
  signal?: AbortSignal,
): Promise<CommunityProfileSummary> {
  const response = await fetch("/api/community/profile", {
    cache: "no-store",
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json().catch(() => null)) as
    | { profile?: CommunityProfileSummary; error?: string }
    | null;
  if (!response.ok || !payload?.profile) throw new Error(payload?.error ?? "Community profile is unavailable right now.");
  return normaliseCommunityProfileSummary(payload.profile);
}

export async function fetchCommunityPublicProfile(
  noteId: string,
  signal?: AbortSignal,
): Promise<CommunityProfileSummary> {
  const response = await fetch(`/api/community/profile?noteId=${encodeURIComponent(noteId)}`, {
    cache: "no-store",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | { profile?: CommunityProfileSummary; error?: string }
    | null;
  if (!response.ok || !payload?.profile) throw new Error(payload?.error ?? "This shopper profile is unavailable right now.");
  return normaliseCommunityProfileSummary(payload.profile);
}
