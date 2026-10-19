-- Accounts Supabase project only.
--
-- Keep Apple entitlement writes atomic. A webhook and a device verification
-- request can arrive concurrently or out of order, so the signed timestamp
-- comparison must happen inside the database upsert rather than in a
-- read-then-write application sequence.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_subscription_entitlement_if_newer(
  p_account_id uuid,
  p_entitlement_key text,
  p_status text,
  p_provider text,
  p_product_id text,
  p_provider_transaction_id text,
  p_original_transaction_id text,
  p_expires_at timestamptz,
  p_provider_signed_at timestamptz,
  p_verified_at timestamptz,
  p_revoked_at timestamptz
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH upserted AS (
    INSERT INTO public.subscription_entitlements (
      account_id,
      entitlement_key,
      status,
      provider,
      product_id,
      provider_transaction_id,
      original_transaction_id,
      expires_at,
      provider_signed_at,
      verified_at,
      revoked_at,
      updated_at
    )
    VALUES (
      p_account_id,
      p_entitlement_key,
      p_status,
      p_provider,
      p_product_id,
      p_provider_transaction_id,
      p_original_transaction_id,
      p_expires_at,
      p_provider_signed_at,
      p_verified_at,
      p_revoked_at,
      p_verified_at
    )
    ON CONFLICT (account_id, entitlement_key, provider, product_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      provider_transaction_id = EXCLUDED.provider_transaction_id,
      original_transaction_id = EXCLUDED.original_transaction_id,
      expires_at = EXCLUDED.expires_at,
      provider_signed_at = EXCLUDED.provider_signed_at,
      verified_at = EXCLUDED.verified_at,
      revoked_at = EXCLUDED.revoked_at,
      updated_at = EXCLUDED.updated_at
    WHERE public.subscription_entitlements.provider_signed_at IS NULL
       OR (
         EXCLUDED.provider_signed_at IS NOT NULL
         AND public.subscription_entitlements.provider_signed_at <= EXCLUDED.provider_signed_at
       )
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upserted);
$$;

REVOKE ALL ON FUNCTION public.upsert_subscription_entitlement_if_newer(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_subscription_entitlement_if_newer(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz
) TO service_role;

COMMIT;
