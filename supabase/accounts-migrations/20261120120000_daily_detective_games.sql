-- Store one completed turn per game type and New Zealand calendar day.
-- Existing quiz attempts remain the source of lifetime score totals and pair history.

BEGIN;

CREATE TABLE IF NOT EXISTS public.deal_detective_daily_completions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_date date NOT NULL,
  game_type text NOT NULL CHECK (game_type IN ('deal-detective', 'supermarket-showdown')),
  left_deal_key text NOT NULL CHECK (char_length(btrim(left_deal_key)) BETWEEN 3 AND 300),
  right_deal_key text NOT NULL CHECK (char_length(btrim(right_deal_key)) BETWEEN 3 AND 300),
  selected_side text NOT NULL CHECK (selected_side IN ('left', 'right')),
  correct_side text NOT NULL CHECK (correct_side IN ('left', 'right')),
  is_correct boolean NOT NULL,
  points_awarded integer NOT NULL CHECK (points_awarded IN (0, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_date, game_type)
);

CREATE INDEX IF NOT EXISTS deal_detective_daily_completions_user_date_idx
  ON public.deal_detective_daily_completions (user_id, game_date DESC);

ALTER TABLE public.deal_detective_daily_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_detective_daily_completions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.deal_detective_daily_completions TO service_role;

CREATE OR REPLACE FUNCTION public.record_deal_detective_daily_attempt(
  p_user_id uuid,
  p_game_date date,
  p_game_type text,
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
  daily_attempt public.deal_detective_daily_completions%ROWTYPE;
  quiz_result record;
  current_profile public.profiles%ROWTYPE;
  daily_publication_key text;
BEGIN
  IF p_user_id IS NULL
    OR p_game_date IS NULL
    OR p_game_type IS NULL
    OR p_game_type NOT IN ('deal-detective', 'supermarket-showdown')
    OR p_game_date <> (now() AT TIME ZONE 'Pacific/Auckland')::date
    OR char_length(btrim(COALESCE(p_publication_key, ''))) = 0
    OR p_quiz_version IS NULL
    OR p_quiz_version < 1
    OR char_length(btrim(COALESCE(p_left_deal_key, ''))) NOT BETWEEN 3 AND 300
    OR char_length(btrim(COALESCE(p_right_deal_key, ''))) NOT BETWEEN 3 AND 300
    OR p_left_deal_key = p_right_deal_key
    OR p_selected_side IS NULL
    OR p_selected_side NOT IN ('left', 'right')
    OR p_correct_side IS NULL
    OR p_correct_side NOT IN ('left', 'right')
  THEN
    RAISE EXCEPTION 'Invalid daily Deal Detective attempt';
  END IF;

  INSERT INTO public.deal_detective_daily_completions (
    user_id, game_date, game_type, left_deal_key, right_deal_key,
    selected_side, correct_side, is_correct, points_awarded
  )
  VALUES (
    p_user_id, p_game_date, p_game_type, btrim(p_left_deal_key), btrim(p_right_deal_key),
    p_selected_side, p_correct_side, p_selected_side = p_correct_side,
    CASE WHEN p_selected_side = p_correct_side THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, game_date, game_type) DO NOTHING
  RETURNING * INTO daily_attempt;

  IF NOT FOUND THEN
    SELECT * INTO daily_attempt
    FROM public.deal_detective_daily_completions AS completion
    WHERE completion.user_id = p_user_id
      AND completion.game_date = p_game_date
      AND completion.game_type = p_game_type;

    SELECT * INTO current_profile
    FROM public.profiles AS profile
    WHERE profile.id = p_user_id;

    IF daily_attempt.user_id IS NULL OR current_profile.id IS NULL THEN
      RAISE EXCEPTION 'Daily game result is unavailable';
    END IF;

    RETURN QUERY SELECT
      true,
      daily_attempt.is_correct,
      daily_attempt.points_awarded,
      current_profile.deal_detective_quiz_correct,
      current_profile.deal_detective_quiz_attempts;
    RETURN;
  END IF;

  -- The existing score recorder deduplicates on publication. Give each
  -- game/date its own bounded key so an unchanged catalogue still awards a
  -- fresh daily point, while retries within the same game remain idempotent.
  daily_publication_key := 'daily:' || p_game_date::text || ':' || p_game_type || ':' || btrim(p_publication_key);

  SELECT * INTO quiz_result
  FROM public.record_deal_detective_quiz_attempt(
    p_user_id,
    daily_publication_key,
    p_quiz_version,
    p_left_deal_key,
    p_right_deal_key,
    p_selected_side,
    p_correct_side
  );

  UPDATE public.deal_detective_daily_completions AS completion
  SET is_correct = quiz_result.is_correct,
      points_awarded = quiz_result.points_awarded
  WHERE completion.user_id = p_user_id
    AND completion.game_date = p_game_date
    AND completion.game_type = p_game_type;

  RETURN QUERY SELECT
    quiz_result.already_recorded,
    quiz_result.is_correct,
    quiz_result.points_awarded,
    quiz_result.quiz_correct,
    quiz_result.quiz_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.record_deal_detective_daily_attempt(uuid, date, text, text, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_deal_detective_daily_attempt(uuid, date, text, text, integer, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
