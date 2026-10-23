-- Keep a moderation decision, its audit row, and report resolution together.
BEGIN;

CREATE OR REPLACE FUNCTION public.submit_community_note_report(
  p_note_id uuid,
  p_reporter_id uuid,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  report_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('community-report:' || p_reporter_id::text, 0));

  SELECT count(*)::integer INTO report_count
  FROM public.community_note_reports
  WHERE reporter_id = p_reporter_id
    AND created_at >= now() - interval '24 hours';
  IF report_count >= 20 THEN
    RAISE EXCEPTION 'Report rate limit reached' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_price_notes
    WHERE id = p_note_id AND status = 'approved' AND published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Note is no longer available to report' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.community_note_reports (note_id, reporter_id, reason, details, status)
  VALUES (p_note_id, p_reporter_id, p_reason, NULLIF(btrim(coalesce(p_details, '')), ''), 'open');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Report already exists' USING ERRCODE = 'P0003';
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_community_price_note(
  p_note_id uuid,
  p_moderator_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  previous_status text;
  next_status text;
  now_at timestamptz := now();
BEGIN
  IF p_action NOT IN ('approve', 'reject', 'hide') THEN
    RAISE EXCEPTION 'Invalid moderation action' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_moderators WHERE account_id = p_moderator_id AND active = true) THEN
    RAISE EXCEPTION 'Moderator is not active' USING ERRCODE = 'P0003';
  END IF;

  SELECT n.status INTO previous_status
  FROM public.community_price_notes AS n
  WHERE n.id = p_note_id
  FOR UPDATE;

  IF previous_status IS NULL OR previous_status NOT IN ('pending', 'approved', 'hidden') THEN
    RAISE EXCEPTION 'Note is not in the moderation queue' USING ERRCODE = 'P0002';
  END IF;

  next_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'hidden'
  END;

  UPDATE public.community_price_notes
  SET status = next_status,
      published_at = CASE WHEN p_action = 'approve' THEN now_at ELSE NULL END,
      moderated_at = now_at,
      moderated_by = p_moderator_id,
      moderation_reason = NULLIF(btrim(coalesce(p_reason, '')), '')
  WHERE community_price_notes.id = p_note_id;

  INSERT INTO public.community_moderation_actions (
    note_id, moderator_id, action, previous_status, new_status, reason
  ) VALUES (
    p_note_id, p_moderator_id, p_action, previous_status, next_status,
    NULLIF(btrim(coalesce(p_reason, '')), '')
  );

  IF p_action IN ('reject', 'hide') THEN
    UPDATE public.community_note_reports
    SET status = 'actioned',
        reviewed_at = now_at,
        reviewed_by = p_moderator_id,
        resolution_note = NULLIF(btrim(coalesce(p_reason, '')), '')
    WHERE note_id = p_note_id AND status = 'open';
  END IF;

  RETURN QUERY SELECT p_note_id, next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_community_note_report(
  p_report_id uuid,
  p_moderator_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  note_id_value uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community_moderators WHERE account_id = p_moderator_id AND active = true) THEN
    RAISE EXCEPTION 'Moderator is not active' USING ERRCODE = 'P0003';
  END IF;

  SELECT r.note_id INTO note_id_value
  FROM public.community_note_reports AS r
  WHERE r.id = p_report_id AND r.status = 'open'
  FOR UPDATE;

  IF note_id_value IS NULL THEN
    RAISE EXCEPTION 'Report is no longer open' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.community_note_reports
  SET status = 'dismissed',
      reviewed_at = now(),
      reviewed_by = p_moderator_id,
      resolution_note = NULLIF(btrim(coalesce(p_reason, '')), '')
  WHERE id = p_report_id AND status = 'open';

  INSERT INTO public.community_moderation_actions (
    report_id, note_id, moderator_id, action, reason
  ) VALUES (
    p_report_id, note_id_value, p_moderator_id, 'dismiss_report',
    NULLIF(btrim(coalesce(p_reason, '')), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_community_price_note(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_price_note(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.dismiss_community_note_report(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_community_note_report(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.submit_community_note_report(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_community_note_report(uuid, uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
