-- Cover the foreign keys added for moderator membership and the audit trail.
BEGIN;

CREATE INDEX IF NOT EXISTS community_moderators_created_by_idx
  ON public.community_moderators (created_by);

CREATE INDEX IF NOT EXISTS community_moderation_actions_moderator_idx
  ON public.community_moderation_actions (moderator_id, created_at DESC);

COMMIT;
