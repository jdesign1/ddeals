import { getAuthenticatedAccount, requireAccountsAdmin } from "@/lib/accounts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function GET(request: Request): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return Response.json({ error: "Sign in to see the streak leaderboard." }, { status: 401 });

  try {
    const account = await getAuthenticatedAccount(token);
    if (!account || account.is_anonymous) {
      return Response.json({ error: "Sign in to see the streak leaderboard." }, { status: 401 });
    }

    const accounts = requireAccountsAdmin();
    const requestedOffset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
    const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 && requestedOffset <= 100_000
      ? requestedOffset
      : 0;
    const { data, error } = await accounts.rpc("get_deal_detective_streak_leaderboard", { p_offset: offset, p_limit: 50 });
    if (error) throw error;

    const entries = (Array.isArray(data) ? data : []).flatMap((row: Record<string, unknown>) => {
      if (
        typeof row.rank_position !== "number"
        || typeof row.display_name !== "string"
        || typeof row.best_streak !== "number"
        || typeof row.current_streak !== "number"
        || (row.city !== null && typeof row.city !== "string")
      ) return [];
      return [{
        position: row.rank_position,
        display_name: row.display_name,
        city: row.city,
        best_streak: row.best_streak,
        current_streak: row.current_streak,
      }];
    });

    return Response.json({ entries, has_more: entries.length === 50 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Deal Detective streak leaderboard request failed.", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "The streak leaderboard couldn’t load right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
