import { recordAppleEvent, requireAccountsAdmin } from "@/lib/apple-subscription-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const PAGE_SIZE = 1000;
const ACCESSIBLE_STATUSES = ["active", "grace_period", "billing_retry"] as const;

interface StaleEntitlementRow {
  id: string;
}

async function fetchStaleEntitlements(
  accounts: ReturnType<typeof requireAccountsAdmin>,
  nowIso: string,
): Promise<StaleEntitlementRow[]> {
  const rows: StaleEntitlementRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await accounts
      .from("subscription_entitlements")
      .select("id")
      .eq("provider", "apple_app_store")
      .in("status", [...ACCESSIBLE_STATUSES])
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read stale entitlements: ${error.message}`);
    const page = (data ?? []) as StaleEntitlementRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function countRecentEvents(
  accounts: ReturnType<typeof requireAccountsAdmin>,
  sinceIso: string,
  errorsOnly: boolean,
): Promise<number> {
  let query = accounts
    .from("subscription_events")
    .select("id", { count: "exact", head: true })
    .like("provider_event_id", "notification:%")
    .gte("received_at", sinceIso);
  if (errorsOnly) query = query.not("processing_error", "is", null);
  const { count, error } = await query;
  if (error) throw new Error(`Could not read subscription event health: ${error.message}`);
  return count ?? 0;
}

async function reconcileEntitlements() {
  const accounts = requireAccountsAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleRows = await fetchStaleEntitlements(accounts, nowIso);
  let expired = 0;

  for (let offset = 0; offset < staleRows.length; offset += PAGE_SIZE) {
    const ids = staleRows.slice(offset, offset + PAGE_SIZE).map((row) => row.id);
    const { data, error } = await accounts
      .from("subscription_entitlements")
      .update({ status: "expired", updated_at: nowIso })
      .in("id", ids)
      .eq("provider", "apple_app_store")
      .in("status", [...ACCESSIBLE_STATUSES])
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso)
      .select("id");
    if (error) throw new Error(`Could not reconcile stale entitlements: ${error.message}`);
    expired += data?.length ?? 0;
  }

  const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [notificationsLast24h, notificationErrorsLast24h] = await Promise.all([
    countRecentEvents(accounts, sinceIso, false),
    countRecentEvents(accounts, sinceIso, true),
  ]);
  const report = {
    runId: crypto.randomUUID(),
    checkedAt: nowIso,
    staleEntitlementsFound: staleRows.length,
    entitlementsMarkedExpired: expired,
    notificationsLast24h,
    notificationErrorsLast24h,
  };

  await recordAppleEvent({
    accounts,
    eventId: `reconciliation:${report.runId}`,
    eventType: "ENTITLEMENT_RECONCILIATION_COMPLETED",
    transaction: null,
    payload: report,
    processedAt: nowIso,
  });

  return report;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Subscription reconciliation is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await reconcileEntitlements();
    console.info("Subscription entitlement reconciliation completed.", report);
    return Response.json(report, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Subscription entitlement reconciliation failed.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json({ error: "Subscription reconciliation failed." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
