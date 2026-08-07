import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Framework-agnostic Supabase client factory. Callers pass their own env
 * vars in (Next.js needs the `NEXT_PUBLIC_` prefix for anything read
 * client-side, which this package deliberately does not assume). Use the
 * anon key from the browser/client components, the service key only from
 * trusted server-side code (Route Handlers, Server Components, Server
 * Actions) — never ship the service key to the client bundle.
 */
export function createSupabaseClient(url: string, key: string): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      "createSupabaseClient: both url and key are required (check SUPABASE_URL / SUPABASE_ANON_KEY env vars in the calling app)"
    );
  }
  return createClient(url, key);
}

export type { SupabaseClient };
