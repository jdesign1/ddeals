import type { SupabaseRestConfig } from "@dodgey-deals/shared";

/**
 * The dedicated Accounts Supabase project. Its client key is intentionally
 * supplied through the environment rather than committed to the repository.
 * Support both Supabase's newer publishable-key name and the older anon-key
 * name so local and hosted environments can migrate independently.
 */
export const accountsConfig: SupabaseRestConfig = {
  url: process.env.NEXT_PUBLIC_ACCOUNTS_SUPABASE_URL || "https://mdgrivegsblocgactyjy.supabase.co",
  anonKey:
    process.env.NEXT_PUBLIC_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_ACCOUNTS_SUPABASE_ANON_KEY ||
    "",
};

export const authRedirectUrl =
  process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");
