-- Keep author edits/removals auditable and rate-limited, while allowing an
-- edited note to retain the moderation signals that caused it to be reviewed.

CREATE TABLE IF NOT EXISTS public.community_note_author_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid REFERENCES public.community_price_notes(id) ON DELETE SET NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('edit', 'delete')),
  previous_status text,
  new_status text,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_note_author_actions_author_created_idx
  ON public.community_note_author_actions (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_note_author_actions_note_created_idx
  ON public.community_note_author_actions (note_id, created_at DESC);

ALTER TABLE public.community_note_author_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_note_author_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_note_author_actions TO service_role;

DROP FUNCTION IF EXISTS public.update_community_price_note(uuid, uuid, text, numeric, date, text, text);

CREATE OR REPLACE FUNCTION public.update_community_price_note(
  p_note_id uuid,
  p_author_id uuid,
  p_source_store_id text,
  p_price numeric,
  p_observed_on date,
  p_region_code text,
  p_body text,
  p_automated_decision text,
  p_automated_reason text,
  p_automated_mode text
)
RETURNS TABLE (status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  note_author_id uuid;
  product_id_value uuid;
  previous_status text;
  resolved_store_name text;
  reason_value text;
  recent_hour_count integer;
  recent_day_count integer;
BEGIN
  IF p_note_id IS NULL OR p_author_id IS NULL THEN
    RAISE EXCEPTION 'invalid note owner or note' USING ERRCODE = 'P0003';
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
  reason_value := coalesce(reason_value, 'author_edit');

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

  SELECT n.author_id, n.product_id, n.status
    INTO note_author_id, product_id_value, previous_status
  FROM public.community_price_notes AS n
  WHERE n.id = p_note_id
  FOR UPDATE;

  IF note_author_id IS NULL OR note_author_id <> p_author_id THEN
    RAISE EXCEPTION 'note does not belong to author' USING ERRCODE = 'P0003';
  END IF;
  IF previous_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'note is not available to edit' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer INTO recent_hour_count
  FROM public.community_note_author_actions
  WHERE author_id = p_author_id
    AND created_at >= now() - interval '1 hour';

  SELECT count(*)::integer INTO recent_day_count
  FROM public.community_note_author_actions
  WHERE author_id = p_author_id
    AND created_at >= now() - interval '1 day';

  IF recent_hour_count >= 3 OR recent_day_count >= 10 THEN
    RAISE EXCEPTION 'community note author action rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  IF p_source_store_id IS NOT NULL AND p_price IS NOT NULL AND p_observed_on IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.community_price_notes AS n
    WHERE n.id <> p_note_id
      AND n.author_id = p_author_id
      AND n.product_id = product_id_value
      AND n.source_store_id = p_source_store_id
      AND n.price = p_price
      AND n.observed_on = p_observed_on
      AND n.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'duplicate community note' USING ERRCODE = 'P0004';
  END IF;

  IF p_source_store_id IS NULL AND p_price IS NULL AND p_observed_on IS NULL AND EXISTS (
    SELECT 1
    FROM public.community_price_notes AS n
    WHERE n.id <> p_note_id
      AND n.author_id = p_author_id
      AND n.product_id = product_id_value
      AND n.source_store_id IS NULL
      AND n.price IS NULL
      AND n.observed_on IS NULL
      AND n.body_fingerprint = md5(lower(btrim(coalesce(p_body, ''))))
      AND n.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'duplicate community note' USING ERRCODE = 'P0004';
  END IF;

  DELETE FROM public.community_note_helpful_votes
  WHERE note_id = p_note_id;

  UPDATE public.community_price_notes
  SET source_store_id = p_source_store_id,
      store_name = resolved_store_name,
      price = p_price,
      observed_on = p_observed_on,
      region_code = p_region_code,
      body = NULLIF(btrim(coalesce(p_body, '')), ''),
      status = 'pending',
      moderation_reason = 'Author submitted an edit',
      moderated_at = NULL,
      moderated_by = NULL,
      published_at = NULL,
      publication_method = 'human_review',
      automated_approved_at = NULL,
      automated_moderation_decision = p_automated_decision,
      automated_moderation_reason = reason_value,
      automated_moderation_provider = 'rules_v1',
      automated_moderation_checked_at = now(),
      automated_moderation_mode = p_automated_mode
  WHERE id = p_note_id;

  INSERT INTO public.community_note_author_actions (
    note_id, author_id, action, previous_status, new_status, reason
  ) VALUES (
    p_note_id, p_author_id, 'edit', previous_status, 'pending', reason_value
  );

  RETURN QUERY SELECT 'pending'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_community_price_note(
  p_note_id uuid,
  p_author_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  note_author_id uuid;
  previous_status text;
  recent_hour_count integer;
  recent_day_count integer;
BEGIN
  IF p_note_id IS NULL OR p_author_id IS NULL THEN
    RAISE EXCEPTION 'invalid note owner or note' USING ERRCODE = 'P0003';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_author_id::text, 0));

  SELECT n.author_id, n.status
    INTO note_author_id, previous_status
  FROM public.community_price_notes AS n
  WHERE n.id = p_note_id
  FOR UPDATE;

  IF note_author_id IS NULL OR note_author_id <> p_author_id THEN
    RAISE EXCEPTION 'note does not belong to author' USING ERRCODE = 'P0003';
  END IF;
  IF previous_status NOT IN ('pending', 'approved', 'hidden') THEN
    RAISE EXCEPTION 'note is no longer available to remove' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer INTO recent_hour_count
  FROM public.community_note_author_actions
  WHERE author_id = p_author_id
    AND created_at >= now() - interval '1 hour';

  SELECT count(*)::integer INTO recent_day_count
  FROM public.community_note_author_actions
  WHERE author_id = p_author_id
    AND created_at >= now() - interval '1 day';

  IF recent_hour_count >= 3 OR recent_day_count >= 10 THEN
    RAISE EXCEPTION 'community note author action rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.community_note_helpful_votes
  WHERE note_id = p_note_id;

  UPDATE public.community_price_notes
  SET status = 'deleted',
      published_at = NULL,
      moderation_reason = 'Removed by author'
  WHERE id = p_note_id;

  INSERT INTO public.community_note_author_actions (
    note_id, author_id, action, previous_status, new_status, reason
  ) VALUES (
    p_note_id, p_author_id, 'delete', previous_status, 'deleted', 'Removed by author'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_community_price_note(uuid, uuid, text, numeric, date, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_community_price_note(uuid, uuid, text, numeric, date, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.delete_community_price_note(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_price_note(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
