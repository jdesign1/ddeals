import type { SupabaseRestConfig } from "@dodgey-deals/shared";

/**
 * The dedicated Accounts Supabase project. Its publishable/anon key is
 * intentionally supplied through the environment rather than committed to
 * the repository. The project URL is public and is derived from the new
 * project's reference so the app can show a useful configuration error until
 * the key is added to `.env.local`.
 */
export const accountsConfig: SupabaseRestConfig = {
  url: process.env.NEXT_PUBLIC_ACCOUNTS_SUPABASE_URL || "https://mdgrivegsblocgactyjy.supabase.co",
  anonKey: process.env.NEXT_PUBLIC_ACCOUNTS_SUPABASE_ANON_KEY || "",
};

export const authRedirectUrl =
  process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");
