import { getAuthenticatedAccount, requireAccountsAdmin } from "@/lib/accounts-server";
import { dealDetectivePairKey } from "@/lib/deal-detective-quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function GET(request: Request): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return Response.json({ error: "Sign in to load your Deal Detective history." }, { status: 401 });

  try {
    const account = await getAuthenticatedAccount(token);
    if (!account || account.is_anonymous) return Response.json({ error: "Sign in to load your Deal Detective history." }, { status: 401 });

    const { data, error } = await requireAccountsAdmin()
      .from("deal_detective_quiz_attempts")
      .select("left_deal_key,right_deal_key")
      .eq("user_id", account.id)
      .limit(5000);
    if (error) throw error;

    const pairKeys = [...new Set((data ?? []).map((row: { left_deal_key: string; right_deal_key: string }) => (
      dealDetectivePairKey(row.left_deal_key, row.right_deal_key)
    )))];
    return Response.json({ pair_keys: pairKeys }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Deal Detective history request failed.", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Deal Detective history is unavailable right now." }, { status: 503 });
  }
}
