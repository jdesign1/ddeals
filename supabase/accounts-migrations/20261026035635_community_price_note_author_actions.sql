-- Author-managed edits return published content to moderation. Removal is a
-- soft delete so the moderation/audit history remains intact.

CREATE OR REPLACE FUNCTION public.update_community_price_note(
  p_note_id uuid,
  p_author_id uuid,
  p_source_store_id text,
  p_price numeric,
  p_observed_on date,
  p_region_code text,
  p_body text
)
RETURNS TABLE (status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  note_author_id uuid;
  previous_status text;
  resolved_store_name text;
BEGIN
  IF p_note_id IS NULL OR p_author_id IS NULL THEN
    RAISE EXCEPTION 'invalid note owner or note' USING ERRCODE = 'P0003';
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

  SELECT n.author_id, n.status
    INTO note_author_id, previous_status
  FROM public.community_price_notes AS n
  WHERE n.id = p_note_id
  FOR UPDATE;

  IF note_author_id IS NULL OR note_author_id <> p_author_id THEN
    RAISE EXCEPTION 'note does not belong to author' USING ERRCODE = 'P0003';
  END IF;
  IF previous_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'note is not available to edit' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.community_price_notes AS n
    WHERE n.id <> p_note_id
      AND n.author_id = p_author_id
      AND n.product_id = (SELECT product_id FROM public.community_price_notes WHERE id = p_note_id)
      AND n.source_store_id IS NOT DISTINCT FROM p_source_store_id
      AND n.price IS NOT DISTINCT FROM p_price
      AND n.observed_on IS NOT DISTINCT FROM p_observed_on
      AND n.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'duplicate community note' USING ERRCODE = 'P0004';
  END IF;

  -- Helpful votes describe the old text/price and must not carry over to a
  -- materially edited version.
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
      automated_moderation_decision = 'review',
      automated_moderation_reason = 'author_edit',
      automated_moderation_provider = 'rules_v1',
      automated_moderation_checked_at = now(),
      automated_moderation_mode = 'active'
  WHERE id = p_note_id;

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

  DELETE FROM public.community_note_helpful_votes
  WHERE note_id = p_note_id;

  UPDATE public.community_price_notes
  SET status = 'deleted',
      published_at = NULL,
      moderation_reason = 'Removed by author'
  WHERE id = p_note_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_community_price_note(uuid, uuid, text, numeric, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_community_price_note(uuid, uuid, text, numeric, date, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.delete_community_price_note(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_price_note(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
