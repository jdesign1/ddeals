-- Keep moderation transitions explicit so a hidden note cannot be
-- accidentally republished by the generic approve action.

BEGIN;

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
  IF NOT EXISTS (
    SELECT 1 FROM public.community_moderators
    WHERE account_id = p_moderator_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Moderator is not active' USING ERRCODE = 'P0003';
  END IF;

  SELECT n.status INTO previous_status
  FROM public.community_price_notes AS n
  WHERE n.id = p_note_id
  FOR UPDATE;

  IF previous_status IS NULL THEN
    RAISE EXCEPTION 'Note is not in the moderation queue' USING ERRCODE = 'P0002';
  END IF;
  IF p_action IN ('approve', 'reject') AND previous_status <> 'pending' THEN
    RAISE EXCEPTION 'Note is not pending review' USING ERRCODE = 'P0002';
  END IF;
  IF p_action = 'hide' AND previous_status <> 'approved' THEN
    RAISE EXCEPTION 'Only a published note can be hidden' USING ERRCODE = 'P0002';
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

  INSERT INTO public.community_moderation_actions (note_id, moderator_id, action, previous_status, new_status, reason)
  VALUES (p_note_id, p_moderator_id, p_action, previous_status, next_status, NULLIF(btrim(coalesce(p_reason, '')), ''));

  IF p_action = 'hide' THEN
    UPDATE public.community_note_reports
    SET status = 'actioned', reviewed_at = now_at, reviewed_by = p_moderator_id,
        resolution_note = NULLIF(btrim(coalesce(p_reason, '')), '')
    WHERE note_id = p_note_id AND status = 'open';
  END IF;

  RETURN QUERY SELECT p_note_id, next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_community_price_note(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_price_note(uuid, uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
