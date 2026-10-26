-- Reports describe the published revision that was reported. Close open
-- reports when an author edits or removes that revision so moderation does
-- not receive a stale or orphaned queue item.

CREATE OR REPLACE FUNCTION public.close_community_note_reports_after_author_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.community_note_reports
  SET status = 'dismissed',
      reviewed_at = now(),
      reviewed_by = NULL,
      resolution_note = CASE
        WHEN NEW.action = 'delete' THEN 'Removed by author'
        ELSE 'Superseded by author edit; review the revised tip if needed.'
      END
  WHERE note_id = NEW.note_id
    AND status = 'open';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_note_author_action_close_reports
  ON public.community_note_author_actions;

CREATE TRIGGER community_note_author_action_close_reports
AFTER INSERT ON public.community_note_author_actions
FOR EACH ROW
EXECUTE FUNCTION public.close_community_note_reports_after_author_action();

REVOKE ALL ON FUNCTION public.close_community_note_reports_after_author_action() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_community_note_reports_after_author_action() TO service_role;

NOTIFY pgrst, 'reload schema';
