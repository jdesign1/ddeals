-- Accounts Supabase project only.
--
-- A device transaction can arrive after a grace-period notification without
-- carrying signed renewal information. Do not let that transaction replace a
-- still-valid grace-period entitlement with an expired state.

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
      status = CASE
        WHEN public.subscription_entitlements.status = 'grace_period'
          AND EXCLUDED.status = 'expired'
          AND public.subscription_entitlements.expires_at IS NOT NULL
          AND public.subscription_entitlements.expires_at > now()
        THEN public.subscription_entitlements.status
        ELSE EXCLUDED.status
      END,
      provider_transaction_id = EXCLUDED.provider_transaction_id,
      original_transaction_id = EXCLUDED.original_transaction_id,
      expires_at = CASE
        WHEN public.subscription_entitlements.status = 'grace_period'
          AND EXCLUDED.status = 'expired'
          AND public.subscription_entitlements.expires_at IS NOT NULL
          AND public.subscription_entitlements.expires_at > now()
        THEN public.subscription_entitlements.expires_at
        ELSE EXCLUDED.expires_at
      END,
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
