-- Let a community tip be useful without requiring structured price evidence.
-- The note body or complete price evidence is still required; empty submissions are rejected.

BEGIN;

ALTER TABLE public.community_price_notes
  ALTER COLUMN source_store_id DROP NOT NULL,
  ALTER COLUMN store_name DROP NOT NULL,
  ALTER COLUMN price DROP NOT NULL,
  ALTER COLUMN observed_on DROP NOT NULL;

ALTER TABLE public.community_price_notes
  ADD COLUMN IF NOT EXISTS body_fingerprint text GENERATED ALWAYS AS (
    CASE WHEN body IS NULL THEN NULL ELSE md5(lower(btrim(body))) END
  ) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.community_price_notes'::regclass
      AND conname = 'community_price_notes_has_content_check'
  ) THEN
    ALTER TABLE public.community_price_notes
      ADD CONSTRAINT community_price_notes_has_content_check
      CHECK (
        NULLIF(btrim(coalesce(body, '')), '') IS NOT NULL
        OR (source_store_id IS NOT NULL AND price IS NOT NULL AND observed_on IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS community_price_notes_comment_duplicate_idx
  ON public.community_price_notes (author_id, product_id, body_fingerprint)
  WHERE status IN ('pending', 'approved')
    AND price IS NULL
    AND body_fingerprint IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_community_price_note(
  p_author_id uuid,
  p_product_id uuid,
  p_source_store_id text,
  p_price numeric,
  p_observed_on date,
  p_region_code text,
  p_body text,
  p_automated_decision text,
  p_automated_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recent_hour_count integer;
  recent_day_count integer;
  resolved_store_name text;
  reason_value text;
BEGIN
  IF p_author_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'invalid note owner or product' USING ERRCODE = 'P0003';
  END IF;

  IF p_automated_decision NOT IN ('allowed', 'review') THEN
    RAISE EXCEPTION 'invalid automated moderation result' USING ERRCODE = 'P0003';
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
    FROM public.community_price_notes
    WHERE author_id = p_author_id
      AND product_id = p_product_id
      AND source_store_id = p_source_store_id
      AND price = p_price
      AND observed_on = p_observed_on
      AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'duplicate community note' USING ERRCODE = 'P0002';
  END IF;

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
    automated_moderation_decision,
    automated_moderation_reason,
    automated_moderation_provider,
    automated_moderation_checked_at
  ) VALUES (
    p_product_id,
    p_source_store_id,
    resolved_store_name,
    p_price,
    p_observed_on,
    p_region_code,
    NULLIF(btrim(coalesce(p_body, '')), ''),
    p_author_id,
    'pending',
    p_automated_decision,
    reason_value,
    'rules_v1',
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_community_price_note(uuid, uuid, text, numeric, date, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_community_price_note(uuid, uuid, text, numeric, date, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
