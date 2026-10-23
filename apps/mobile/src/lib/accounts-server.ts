import { createSupabaseClient, type SupabaseClient, type User } from "@dodgey-deals/shared";
import { accountsConfig } from "@/lib/accounts-config";

/** Generic server-only helpers for the dedicated Accounts Supabase project. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getAuthenticatedAccount(accessToken: string): Promise<User | null> {
  if (!accountsConfig.anonKey) return null;
  const verifier = createSupabaseClient(accountsConfig.url, accountsConfig.anonKey);
  const { data, error } = await verifier.auth.getUser(accessToken);
  return error || !data.user ? null : data.user;
}

export async function getAuthenticatedAccountId(accessToken: string): Promise<string | null> {
  const user = await getAuthenticatedAccount(accessToken);
  return user?.id ?? null;
}

export function requireAccountsAdmin(): SupabaseClient {
  const serviceKey = process.env.ACCOUNTS_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Accounts Supabase service role is not configured");
  return createSupabaseClient(accountsConfig.url, serviceKey);
}
