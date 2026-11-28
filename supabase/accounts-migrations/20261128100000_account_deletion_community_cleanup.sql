-- Accounts Supabase project only.
-- Remove user-authored comments atomically with account deletion. Preserve
-- complete structured price evidence without its author or free-form text.

BEGIN;

ALTER TABLE public.community_moderation_actions
  ALTER COLUMN moderator_id DROP NOT NULL;

ALTER TABLE public.community_moderation_actions
  DROP CONSTRAINT IF EXISTS community_moderation_actions_moderator_id_fkey;

ALTER TABLE public.community_moderation_actions
  ADD CONSTRAINT community_moderation_actions_moderator_id_fkey
  FOREIGN KEY (moderator_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.prepare_community_notes_for_account_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A note without a complete price record is only a comment. Delete it so
  -- neither its text nor its comment-only shell survives account deletion.
  DELETE FROM public.community_price_notes AS note
  WHERE note.author_id = OLD.id
    AND NOT (
      note.source_store_id IS NOT NULL
      AND note.price IS NOT NULL
      AND note.observed_on IS NOT NULL
    );

  -- Keep structured price evidence useful, but remove its author and all
  -- accompanying free-form text in the same transaction as user deletion.
  UPDATE public.community_price_notes AS note
  SET author_id = NULL,
      author_display_name_snapshot = 'Deleted shopper',
      body = NULL
  WHERE note.author_id = OLD.id
    AND note.source_store_id IS NOT NULL
    AND note.price IS NOT NULL
    AND note.observed_on IS NOT NULL;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_community_notes_for_account_deletion()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prepare_community_notes_for_account_deletion ON auth.users;
CREATE TRIGGER prepare_community_notes_for_account_deletion
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_community_notes_for_account_deletion();

NOTIFY pgrst, 'reload schema';

COMMIT;
