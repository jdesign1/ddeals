import { createSupabaseClient } from "@dodgey-deals/shared";
import { accountsConfig } from "@/lib/accounts-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const serviceKey = process.env.ACCOUNTS_SUPABASE_SERVICE_ROLE_KEY;
  const environmentReady = Boolean(
    process.env.CRON_SECRET &&
    serviceKey &&
    process.env.APNS_AUTH_KEY_P8 &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID
  );

  if (!environmentReady || !serviceKey) {
    return Response.json({ ready: false }, { headers: { "Cache-Control": "no-store" } });
  }

  // Env vars alone aren't enough to enable the switch: the opt-in and unread
  // tables must exist in the Accounts project too. Keep all config/query
  // details server-side and expose only the readiness boolean to the app.
  const accounts = createSupabaseClient(accountsConfig.url, serviceKey);
  const { error } = await accounts.from("notification_preferences").select("user_id").limit(1);
  return Response.json({ ready: !error }, { headers: { "Cache-Control": "no-store" } });
}
