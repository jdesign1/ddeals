-- Qualify the duplicate-check status column because the function returns a
-- column named status as well.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_community_price_note(
  p_author_id uuid,
  p_product_id uuid,
  p_source_store_id text,
  p_price numeric,
  p_observed_on date,
  p_region_code text,
  p_body text,
  p_automated_decision text,
  p_automated_reason text DEFAULT NULL,
  p_automated_mode text DEFAULT 'off',
  p_auto_approve boolean DEFAULT false
)
RETURNS TABLE (status text, publication_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recent_hour_count integer;
  recent_day_count integer;
  resolved_store_name text;
  reason_value text;
  auto_approved_value boolean;
  status_value text;
  publication_method_value text;
BEGIN
  IF p_author_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'invalid note owner or product' USING ERRCODE = 'P0003';
  END IF;

  IF p_automated_decision NOT IN ('allowed', 'review') THEN
    RAISE EXCEPTION 'invalid automated moderation result' USING ERRCODE = 'P0003';
  END IF;

  IF p_automated_mode NOT IN ('off', 'shadow', 'active') THEN
    RAISE EXCEPTION 'invalid automated moderation mode' USING ERRCODE = 'P0003';
  END IF;

  reason_value := NULLIF(btrim(coalesce(p_automated_reason, '')), '');
  IF p_automated_decision = 'review' AND reason_value IS NULL THEN
    RAISE EXCEPTION 'automated review requires a reason' USING ERRCODE = 'P0003';
  END IF;

  IF NULLIF(btrim(coalesce(p_body, '')), '') IS NULL
    AND NOT (p_source_store_id IS NOT NULL AND p_price IS NOT NULL AND p_observed_on IS NOT NULL) THEN
    RAISE EXCEPTION 'note needs a tip or complete price evidence' USING ERRCODE = 'P0003';
  END IF;

  resolved_store_name := CASE p_source_store_id
    WHEN 'newworld' THEN 'New World'
    WHEN 'paknsave' THEN 'PAK''nSAVE'
    WHEN 'woolworths' THEN 'Woolworths'
    WHEN 'foursquare' THEN 'Four Square'
    WHEN 'supervalue' THEN 'SuperValue'
    WHEN 'chemistwarehouse' THEN 'Chemist Warehouse'
    ELSE NULL
  END;
  IF p_source_store_id IS NOT NULL AND resolved_store_name IS NULL THEN
    RAISE EXCEPTION 'invalid supermarket' USING ERRCODE = 'P0003';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_author_id::text, 0));

  SELECT count(*)::integer INTO recent_hour_count
  FROM public.community_price_notes
  WHERE author_id = p_author_id
    AND created_at >= now() - interval '1 hour';

  SELECT count(*)::integer INTO recent_day_count
  FROM public.community_price_notes
  WHERE author_id = p_author_id
    AND created_at >= now() - interval '1 day';

  IF recent_hour_count >= 3 OR recent_day_count >= 10 THEN
    RAISE EXCEPTION 'community note rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  IF p_source_store_id IS NOT NULL AND p_price IS NOT NULL AND p_observed_on IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.community_price_notes AS n
    WHERE author_id = p_author_id
      AND product_id = p_product_id
      AND source_store_id = p_source_store_id
      AND price = p_price
      AND observed_on = p_observed_on
      AND n.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'duplicate community note' USING ERRCODE = 'P0002';
  END IF;

  auto_approved_value := coalesce(p_auto_approve, false)
    AND p_automated_mode = 'active'
    AND p_automated_decision = 'allowed';
  status_value := CASE WHEN auto_approved_value THEN 'approved' ELSE 'pending' END;
  publication_method_value := CASE WHEN auto_approved_value THEN 'automated' ELSE 'human_review' END;

  INSERT INTO public.community_price_notes (
    product_id,
    source_store_id,
    store_name,
    price,
    observed_on,
    region_code,
    body,
    author_id,
    status,
    published_at,
    publication_method,
    automated_approved_at,
    automated_moderation_decision,
    automated_moderation_reason,
    automated_moderation_provider,
    automated_moderation_checked_at,
    automated_moderation_mode
  ) VALUES (
    p_product_id,
    p_source_store_id,
    resolved_store_name,
    p_price,
    p_observed_on,
    p_region_code,
    NULLIF(btrim(coalesce(p_body, '')), ''),
    p_author_id,
    status_value,
    CASE WHEN auto_approved_value THEN now() ELSE NULL END,
    publication_method_value,
    CASE WHEN auto_approved_value THEN now() ELSE NULL END,
    p_automated_decision,
    reason_value,
    'rules_v1',
    now(),
    p_automated_mode
  );

  RETURN QUERY SELECT status_value, publication_method_value;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_community_price_note(uuid, uuid, text, numeric, date, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_community_price_note(uuid, uuid, text, numeric, date, text, text, text, text, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
