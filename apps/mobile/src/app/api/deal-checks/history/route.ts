import {
  FREE_CHECK_HISTORY_LIMIT,
  FREE_DEAL_STATS_CHECK_LIMIT,
  isEntitlementUsable,
  PREMIUM_CHECK_HISTORY_LIMIT,
  type SupabaseClient,
  type DealCheckRow,
  type EntitlementStatus,
} from "@dodgey-deals/shared";
import { accountsConfig } from "@/lib/accounts-config";
import {
  getAuthenticatedAccountId,
  requireAccountsAdmin,
} from "@/lib/apple-subscription-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const PAGE_SIZE = 1000;

type CheckHistoryScope = "history" | "stats";

interface EntitlementRow {
  status: EntitlementStatus;
  expires_at: string | null;
}

function parseScope(value: string | null): CheckHistoryScope | null {
  if (!value || value === "history") return "history";
  if (value === "stats") return "stats";
  return null;
}

function validIso(value: string | null): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

async function fetchCheckPages(
  accounts: SupabaseClient,
  accountId: string,
  limit: number,
  startAt: string | null,
  endAt: string | null,
): Promise<DealCheckRow[]> {
  const rows: DealCheckRow[] = [];
  for (let offset = 0; rows.length < limit; offset += PAGE_SIZE) {
    const pageLimit = Math.min(PAGE_SIZE, limit - rows.length);
    let query = accounts
      .from("deal_checks")
      .select("id,user_id,product_id,store,price,original_price,deal_type,checked_at")
      .eq("user_id", accountId)
      .order("checked_at", { ascending: false })
      .range(offset, offset + pageLimit - 1);
    if (startAt) query = query.gte("checked_at", startAt);
    if (endAt) query = query.lt("checked_at", endAt);

    const { data, error } = await query;
    if (error) throw new Error(`Could not read deal check history: ${error.message}`);
    const page = (data ?? []) as DealCheckRow[];
    rows.push(...page);
    if (page.length < pageLimit) break;
  }
  return rows;
}

export async function GET(request: Request) {
  try {
    if (!accountsConfig.anonKey) {
      return Response.json({ error: "Account history is not configured." }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!accessToken) {
      return Response.json({ error: "Sign in to view your deal history." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const accountId = await getAuthenticatedAccountId(accessToken);
    if (!accountId) {
      return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const url = new URL(request.url);
    const scope = parseScope(url.searchParams.get("scope"));
    if (!scope) {
      return Response.json({ error: "Invalid deal history scope." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const accounts = requireAccountsAdmin();
    const entitlementResult = await accounts
      .from("subscription_entitlements")
      .select("status,expires_at")
      .eq("account_id", accountId)
      .eq("entitlement_key", "premium_access");
    if (entitlementResult.error) throw new Error(`Could not read subscription entitlements: ${entitlementResult.error.message}`);

    const isPremium = ((entitlementResult.data ?? []) as EntitlementRow[]).some((row) => isEntitlementUsable(row));
    const limit = isPremium
      ? PREMIUM_CHECK_HISTORY_LIMIT
      : scope === "stats"
        ? FREE_DEAL_STATS_CHECK_LIMIT
        : FREE_CHECK_HISTORY_LIMIT;

    // Free users always receive the recent slice. Premium users may use the
    // month filter because their extended history is allowed to go back.
    const startAt = isPremium && validIso(url.searchParams.get("startAt")) ? url.searchParams.get("startAt") : null;
    const endAt = isPremium && validIso(url.searchParams.get("endAt")) ? url.searchParams.get("endAt") : null;
    const rows = await fetchCheckPages(accounts, accountId, limit, startAt, endAt);

    return Response.json(
      { rows, isPremium, limited: !isPremium },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Deal check history request failed.", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "We could not load your deal history." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
