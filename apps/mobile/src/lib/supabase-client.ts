import { createSupabaseClient, type SupabaseClient } from "@dodgey-deals/shared";
import { supabaseConfig } from "./config";

/**
 * Single browser Supabase client instance for the whole app — auth session
 * (and its refresh/localStorage persistence) needs exactly one client, not
 * one per component/hook. Anon key only, same key `config.ts` already
 * exposes client-side; RLS is what actually gates access once a user signs
 * in (see /migrations/20260808_lists_and_list_items.sql).
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  }
  return client;
}
