import { createSupabaseClient, type SupabaseClient } from "@dodgey-deals/shared";
import { accountsConfig } from "./accounts-config";

let client: SupabaseClient | null = null;

/** Returns the dedicated Accounts client when its publishable key is configured. */
export function getAccountsSupabaseClient(): SupabaseClient | null {
  if (!accountsConfig.anonKey) return null;
  if (!client) client = createSupabaseClient(accountsConfig.url, accountsConfig.anonKey);
  return client;
}

export function requireAccountsSupabaseClient(): SupabaseClient {
  const accountsClient = getAccountsSupabaseClient();
  if (!accountsClient) throw new Error("Accounts Supabase is not configured.");
  return accountsClient;
}
