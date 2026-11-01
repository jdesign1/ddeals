-- Deal Detective pairs are one-time games per account, even when the same
-- catalogue pair appears in a later publication or is opened on another device.

BEGIN;

ALTER TABLE public.deal_detective_quiz_attempts
  DROP CONSTRAINT IF EXISTS deal_detective_quiz_attempts_user_id_publication_key_quiz_version_key;

CREATE UNIQUE INDEX IF NOT EXISTS deal_detective_quiz_attempts_user_pair_idx
  ON public.deal_detective_quiz_attempts (
    user_id,
    LEAST(left_deal_key, right_deal_key),
    GREATEST(left_deal_key, right_deal_key)
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
