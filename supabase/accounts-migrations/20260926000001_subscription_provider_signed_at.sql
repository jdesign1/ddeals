-- Accounts Supabase project only.
-- Preserve Apple signed ordering so an older notification cannot overwrite a
-- newer renewal or refund state.

alter table public.subscription_entitlements
  add column if not exists provider_signed_at timestamptz;
