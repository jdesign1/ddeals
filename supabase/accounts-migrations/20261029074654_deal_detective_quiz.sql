-- Deal Detective quiz attempts are server-validated and private at the table
-- level. Public profile routes expose only the two aggregate counters added to
-- profiles below.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deal_detective_quiz_correct integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deal_detective_quiz_attempts integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_deal_detective_quiz_correct_nonnegative'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_deal_detective_quiz_correct_nonnegative
      CHECK (deal_detective_quiz_correct >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_deal_detective_quiz_attempts_nonnegative'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_deal_detective_quiz_attempts_nonnegative
      CHECK (deal_detective_quiz_attempts >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_deal_detective_quiz_correct_lte_attempts'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_deal_detective_quiz_correct_lte_attempts
      CHECK (deal_detective_quiz_correct <= deal_detective_quiz_attempts);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.deal_detective_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_key text NOT NULL CHECK (char_length(btrim(publication_key)) BETWEEN 1 AND 120),
  quiz_version integer NOT NULL DEFAULT 1 CHECK (quiz_version > 0),
  left_deal_key text NOT NULL CHECK (char_length(btrim(left_deal_key)) BETWEEN 3 AND 300),
  right_deal_key text NOT NULL CHECK (char_length(btrim(right_deal_key)) BETWEEN 3 AND 300),
  selected_side text NOT NULL CHECK (selected_side IN ('left', 'right')),
  correct_side text NOT NULL CHECK (correct_side IN ('left', 'right')),
  is_correct boolean NOT NULL,
  points_awarded integer NOT NULL CHECK (points_awarded IN (0, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, publication_key, quiz_version)
);

CREATE INDEX IF NOT EXISTS deal_detective_quiz_attempts_user_idx
  ON public.deal_detective_quiz_attempts (user_id, created_at DESC);

ALTER TABLE public.deal_detective_quiz_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_detective_quiz_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.deal_detective_quiz_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.record_deal_detective_quiz_attempt(
  p_user_id uuid,
  p_publication_key text,
  p_quiz_version integer,
  p_left_deal_key text,
  p_right_deal_key text,
  p_selected_side text,
  p_correct_side text
)
RETURNS TABLE (
  already_recorded boolean,
  is_correct boolean,
  points_awarded integer,
  quiz_correct integer,
  quiz_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  saved_attempt public.deal_detective_quiz_attempts%ROWTYPE;
  current_profile public.profiles%ROWTYPE;
  computed_is_correct boolean;
  computed_points integer;
BEGIN
  IF p_user_id IS NULL
    OR char_length(btrim(COALESCE(p_publication_key, ''))) = 0
    OR p_quiz_version IS NULL
    OR p_quiz_version < 1
    OR p_selected_side NOT IN ('left', 'right')
    OR p_correct_side NOT IN ('left', 'right')
  THEN
    RAISE EXCEPTION 'Invalid Deal Detective quiz attempt';
  END IF;

  computed_is_correct := p_selected_side = p_correct_side;
  computed_points := CASE WHEN computed_is_correct THEN 1 ELSE 0 END;

  INSERT INTO public.deal_detective_quiz_attempts (
    user_id,
    publication_key,
    quiz_version,
    left_deal_key,
    right_deal_key,
    selected_side,
    correct_side,
    is_correct,
    points_awarded
  )
  VALUES (
    p_user_id,
    btrim(p_publication_key),
    p_quiz_version,
    btrim(p_left_deal_key),
    btrim(p_right_deal_key),
    p_selected_side,
    p_correct_side,
    computed_is_correct,
    computed_points
  )
  ON CONFLICT (user_id, publication_key, quiz_version) DO NOTHING
  RETURNING * INTO saved_attempt;

  IF FOUND THEN
    UPDATE public.profiles
    SET deal_detective_quiz_attempts = deal_detective_quiz_attempts + 1,
        deal_detective_quiz_correct = deal_detective_quiz_correct + saved_attempt.points_awarded,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING * INTO current_profile;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account profile is unavailable';
    END IF;

    RETURN QUERY SELECT
      false,
      saved_attempt.is_correct,
      saved_attempt.points_awarded,
      current_profile.deal_detective_quiz_correct,
      current_profile.deal_detective_quiz_attempts;
    RETURN;
  END IF;

  SELECT *
  INTO saved_attempt
  FROM public.deal_detective_quiz_attempts
  WHERE user_id = p_user_id
    AND publication_key = btrim(p_publication_key)
    AND quiz_version = p_quiz_version;

  SELECT *
  INTO current_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account profile is unavailable';
  END IF;

  RETURN QUERY SELECT
    true,
    saved_attempt.is_correct,
    saved_attempt.points_awarded,
    current_profile.deal_detective_quiz_correct,
    current_profile.deal_detective_quiz_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.record_deal_detective_quiz_attempt(uuid, text, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_deal_detective_quiz_attempt(uuid, text, integer, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
