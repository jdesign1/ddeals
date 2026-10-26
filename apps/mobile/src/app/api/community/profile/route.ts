import { getAuthenticatedAccount, isUuid, requireAccountsAdmin } from "@/lib/accounts-server";
import { buildCommunityReputation, type CommunityAuthorContribution } from "@/lib/community-reputation";

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

    const profile = buildCommunityReputation(targetAuthorId, [...contributionsByAuthor.values()]);
    return Response.json({
      profile: {
        tips_shared: profile.tipsShared,
        helpful_received: profile.helpfulReceived,
        rank: profile.rank,
        contributor_count: profile.contributorCount,
      },
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Community profile request failed.", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("Community profile is unavailable right now. Please try again.", 503);
  }
}
