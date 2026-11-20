-- Keep Deal Detective streak aggregates current as answers are recorded, then
-- expose a paged, public-safe leaderboard to the server service role only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.deal_detective_streak_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak integer NOT NULL DEFAULT 0 CHECK (best_streak >= current_streak),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_detective_streak_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_detective_streak_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.deal_detective_streak_stats TO service_role;
CREATE INDEX IF NOT EXISTS deal_detective_streak_stats_rank_idx
  ON public.deal_detective_streak_stats (best_streak DESC, current_streak DESC, user_id);

-- Backfill existing attempts once, ordered by their recorded time. Showdown
-- answers are excluded because the personal streak is for Deal Detective.
WITH ordered_attempts AS (
  SELECT
    attempt.user_id,
    attempt.is_correct,
    sum(CASE WHEN NOT attempt.is_correct THEN 1 ELSE 0 END) OVER (
      PARTITION BY attempt.user_id
      ORDER BY attempt.created_at, attempt.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS loss_group,
    row_number() OVER (
      PARTITION BY attempt.user_id
      ORDER BY attempt.created_at DESC, attempt.id DESC
    ) AS latest_attempt_rank
  FROM public.deal_detective_quiz_attempts AS attempt
  WHERE attempt.publication_key NOT LIKE 'daily:%:supermarket-showdown:%'
),
streak_runs AS (
  SELECT
    attempt.user_id,
    attempt.loss_group,
    count(*) FILTER (WHERE attempt.is_correct) AS run_length,
    bool_or(attempt.latest_attempt_rank = 1 AND attempt.is_correct) AS is_current_run
  FROM ordered_attempts AS attempt
  GROUP BY attempt.user_id, attempt.loss_group
),
user_streaks AS (
  SELECT
    run.user_id,
    COALESCE(max(run.run_length) FILTER (WHERE run.is_current_run), 0)::integer AS current_streak,
    max(run.run_length)::integer AS best_streak
  FROM streak_runs AS run
  GROUP BY run.user_id
)
INSERT INTO public.deal_detective_streak_stats (user_id, current_streak, best_streak)
SELECT user_id, current_streak, best_streak
FROM user_streaks
ON CONFLICT (user_id) DO UPDATE
SET current_streak = EXCLUDED.current_streak,
    best_streak = EXCLUDED.best_streak,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.update_deal_detective_streak_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.publication_key LIKE 'daily:%:supermarket-showdown:%' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.deal_detective_streak_stats AS stats (
    user_id, current_streak, best_streak, updated_at
  )
  VALUES (
    NEW.user_id,
    CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET current_streak = CASE
        WHEN NEW.is_correct THEN stats.current_streak + 1
        ELSE 0
      END,
      best_streak = CASE
        WHEN NEW.is_correct THEN greatest(stats.best_streak, stats.current_streak + 1)
        ELSE stats.best_streak
      END,
      updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_deal_detective_streak_stats() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS deal_detective_streak_stats_after_attempt ON public.deal_detective_quiz_attempts;
CREATE TRIGGER deal_detective_streak_stats_after_attempt
  AFTER INSERT ON public.deal_detective_quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_deal_detective_streak_stats();

CREATE OR REPLACE FUNCTION public.get_deal_detective_streak_leaderboard(
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  rank_position bigint,
  display_name text,
  city text,
  best_streak integer,
  current_streak integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eligible_authors AS (
    SELECT DISTINCT ON (note.author_id)
      note.author_id AS user_id,
      COALESCE(NULLIF(btrim(note.author_display_name_snapshot), ''), 'Community shopper') AS display_name
    FROM public.community_price_notes AS note
    WHERE note.author_id IS NOT NULL
      AND note.status = 'approved'
      AND note.published_at IS NOT NULL
    ORDER BY note.author_id, note.published_at DESC, note.id DESC
  ),
  ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY stats.best_streak DESC, stats.current_streak DESC, eligible.display_name ASC, eligible.user_id ASC
      ) AS rank_position,
      eligible.display_name,
      NULLIF(btrim(profile.city), '') AS city,
      stats.best_streak,
      stats.current_streak
    FROM public.deal_detective_streak_stats AS stats
    INNER JOIN eligible_authors AS eligible ON eligible.user_id = stats.user_id
    LEFT JOIN public.profiles AS profile ON profile.id = stats.user_id
  )
  SELECT ranked.rank_position, ranked.display_name, ranked.city, ranked.best_streak, ranked.current_streak
  FROM ranked
  WHERE ranked.rank_position > greatest(COALESCE(p_offset, 0), 0)
  ORDER BY ranked.rank_position
  LIMIT least(greatest(COALESCE(p_limit, 50), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_deal_detective_streak_leaderboard(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_deal_detective_streak_leaderboard(integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
