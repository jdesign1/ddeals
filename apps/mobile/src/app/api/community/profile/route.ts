import { getAuthenticatedAccount, isUuid, requireAccountsAdmin } from "@/lib/accounts-server";
import { buildCommunityReputation, type CommunityAuthorContribution } from "@/lib/community-reputation";
import { cleanPublicProfileField, containsPublicProfileContactDetails, PUBLIC_PROFILE_FIELD_LIMITS } from "@/lib/public-profile-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const PUBLIC_PROFILE_HEADERS = { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=120" };
const PAGE_SIZE = 1000;

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

async function readPublicProfileFields(
  accounts: ReturnType<typeof requireAccountsAdmin>,
  authorId: string,
) {
  const { data, error } = await accounts
    .from("profiles")
    .select("city,favorite_store_branch,profile_quote,deal_detective_quiz_correct,deal_detective_quiz_attempts")
    .eq("id", authorId)
    .maybeSingle();

  // Keep the stats endpoint backwards-compatible while the accounts migration
  // rolls out. The fields remain empty until the columns exist.
  if (error && (error.code === "42703" || /column .* does not exist/i.test(error.message))) {
    return { city: null, favorite_store_branch: null, profile_quote: null, deal_detective_quiz_correct: 0, deal_detective_quiz_attempts: 0 };
  }
  if (error) throw error;

  const quote = cleanPublicProfileField(data?.profile_quote, PUBLIC_PROFILE_FIELD_LIMITS.profile_quote);
  return {
    city: cleanPublicProfileField(data?.city, PUBLIC_PROFILE_FIELD_LIMITS.city),
    favorite_store_branch: cleanPublicProfileField(data?.favorite_store_branch, PUBLIC_PROFILE_FIELD_LIMITS.favorite_store_branch),
    profile_quote: quote && !containsPublicProfileContactDetails(quote) ? quote : null,
    deal_detective_quiz_correct: Math.max(0, Number(data?.deal_detective_quiz_correct ?? 0)),
    deal_detective_quiz_attempts: Math.max(0, Number(data?.deal_detective_quiz_attempts ?? 0)),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const noteId = url.searchParams.get("noteId")?.trim() ?? "";
  const token = getBearerToken(request);
  let targetAuthorId = "";

  try {
    const accounts = requireAccountsAdmin();
    if (noteId) {
      if (!isUuid(noteId)) return errorResponse("That community profile could not be found.", 404);
      const { data: note, error: noteError } = await accounts
        .from("community_price_notes")
        .select("author_id")
        .eq("id", noteId)
        .eq("status", "approved")
        .not("published_at", "is", null)
        .maybeSingle();
      if (noteError) throw noteError;
      if (!note?.author_id) return errorResponse("That community profile could not be found.", 404);
      targetAuthorId = note.author_id;
    } else {
      if (!token) return errorResponse("Log in to view your community profile.", 401);
      const account = await getAuthenticatedAccount(token);
      if (!account) return errorResponse("Your sign-in has expired. Please log in again.", 401);
      if (account.is_anonymous) return errorResponse("Log in with an account to view your community profile.", 403);
      targetAuthorId = account.id;
    }

    const publicProfileFields = await readPublicProfileFields(accounts, targetAuthorId);

    if (noteId) {
      const { data: authorNotes, error: authorNotesError } = await accounts
        .from("community_price_notes")
        .select("helpful_count")
        .eq("author_id", targetAuthorId)
        .eq("status", "approved")
        .not("published_at", "is", null);
      if (authorNotesError) throw authorNotesError;
      const profile = {
        tipsShared: authorNotes?.length ?? 0,
        helpfulReceived: (authorNotes ?? []).reduce((total, note) => total + Math.max(0, Number(note.helpful_count ?? 0)), 0),
      };
      return Response.json({
        profile: {
          tips_shared: profile.tipsShared,
          helpful_received: profile.helpfulReceived,
          rank: null,
          contributor_count: null,
          ...publicProfileFields,
        },
      }, { headers: PUBLIC_PROFILE_HEADERS });
    }

    const contributionsByAuthor = new Map<string, CommunityAuthorContribution>();
    let lastNoteId: string | null = null;

    while (true) {
      let notesQuery = accounts
        .from("community_price_notes")
        .select("id,author_id,helpful_count")
        .eq("status", "approved")
        .not("published_at", "is", null)
        .not("author_id", "is", null)
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (lastNoteId) notesQuery = notesQuery.gt("id", lastNoteId);

      const { data, error } = await notesQuery;
      if (error) throw error;

      for (const note of data ?? []) {
        if (!note.author_id) continue;
        const existing = contributionsByAuthor.get(note.author_id) ?? {
          authorId: note.author_id,
          tipsShared: 0,
          helpfulReceived: 0,
        };
        existing.tipsShared += 1;
        existing.helpfulReceived += Math.max(0, Number(note.helpful_count ?? 0));
        contributionsByAuthor.set(note.author_id, existing);
      }

      if (!data || data.length < PAGE_SIZE) break;
      lastNoteId = data[data.length - 1]?.id ?? null;
      if (!lastNoteId) break;
    }

    const targetContribution = contributionsByAuthor.get(targetAuthorId);
    if (targetContribution) targetContribution.quizCorrect = publicProfileFields.deal_detective_quiz_correct;

    const profile = buildCommunityReputation(targetAuthorId, [...contributionsByAuthor.values()]);
    return Response.json({
      profile: {
        tips_shared: profile.tipsShared,
        helpful_received: profile.helpfulReceived,
        rank: profile.rank,
        contributor_count: profile.contributorCount,
        ...publicProfileFields,
      },
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community profile request failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("Community profile is unavailable right now. Please try again.", 503);
  }
}
