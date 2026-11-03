-- Accounts Supabase project only.
--
-- The unique-pairs migration replaced the publication-based constraint with an
-- unordered deal-pair index. Keep score recording idempotent against that
-- active index and return the existing result for a repeated pair.

BEGIN;

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
  normalized_publication_key text;
  normalized_left_deal_key text;
  normalized_right_deal_key text;
BEGIN
  normalized_publication_key := btrim(COALESCE(p_publication_key, ''));
  normalized_left_deal_key := btrim(COALESCE(p_left_deal_key, ''));
  normalized_right_deal_key := btrim(COALESCE(p_right_deal_key, ''));

  IF p_user_id IS NULL
    OR char_length(normalized_publication_key) = 0
    OR p_quiz_version IS NULL
    OR p_quiz_version < 1
    OR char_length(normalized_left_deal_key) < 3
    OR char_length(normalized_left_deal_key) > 300
    OR char_length(normalized_right_deal_key) < 3
    OR char_length(normalized_right_deal_key) > 300
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
    normalized_publication_key,
    p_quiz_version,
    normalized_left_deal_key,
    normalized_right_deal_key,
    p_selected_side,
    p_correct_side,
    computed_is_correct,
    computed_points
  )
  ON CONFLICT DO NOTHING
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
    AND LEAST(left_deal_key, right_deal_key) = LEAST(normalized_left_deal_key, normalized_right_deal_key)
    AND GREATEST(left_deal_key, right_deal_key) = GREATEST(normalized_left_deal_key, normalized_right_deal_key);

  SELECT *
  INTO current_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account profile is unavailable';
  END IF;

  IF saved_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Deal Detective quiz result is unavailable';
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
