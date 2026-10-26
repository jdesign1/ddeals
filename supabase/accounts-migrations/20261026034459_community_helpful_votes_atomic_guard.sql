-- Keep helpful-vote validation, rate limiting, and mutation in one transaction.
-- The API route uses the service role, so this function is the database guard
-- that remains authoritative if another trusted server path is added later.

CREATE TABLE IF NOT EXISTS public.community_note_helpful_vote_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.community_price_notes(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('add', 'remove')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_note_helpful_vote_events_voter_idx
  ON public.community_note_helpful_vote_events (voter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_price_notes_published_author_id_idx
  ON public.community_price_notes (id, author_id) INCLUDE (helpful_count)
  WHERE status = 'approved' AND published_at IS NOT NULL AND author_id IS NOT NULL;

ALTER TABLE public.community_note_helpful_vote_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_note_helpful_vote_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_note_helpful_vote_events TO service_role;

CREATE OR REPLACE FUNCTION public.set_community_note_helpful(
  p_note_id uuid,
  p_voter_id uuid,
  p_helpful boolean
)
RETURNS TABLE (helpful_count integer, viewer_has_helpful_vote boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  note_author_id uuid;
  note_status text;
  note_published_at timestamptz;
  current_vote boolean;
  recent_changes integer;
BEGIN
  IF p_note_id IS NULL OR p_voter_id IS NULL OR p_helpful IS NULL THEN
    RAISE EXCEPTION 'invalid helpful vote' USING ERRCODE = 'P0001';
  END IF;

  -- Serialise changes per voter so the daily limit and vote state cannot be
  -- bypassed by concurrent requests from the same account.
  PERFORM pg_advisory_xact_lock(hashtextextended('community-helpful:' || p_voter_id::text, 0));

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = p_voter_id AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'verified account required' USING ERRCODE = 'P0005';
  END IF;

  SELECT n.author_id, n.status, n.published_at
    INTO note_author_id, note_status, note_published_at
  FROM public.community_price_notes AS n
  WHERE n.id = p_note_id
  FOR UPDATE;

  IF note_author_id IS NULL OR note_status <> 'approved' OR note_published_at IS NULL THEN
    RAISE EXCEPTION 'tip is no longer available' USING ERRCODE = 'P0002';
  END IF;

  IF note_author_id = p_voter_id THEN
    RAISE EXCEPTION 'cannot rate your own tip' USING ERRCODE = 'P0003';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.community_user_blocks AS b
    WHERE b.blocker_id = p_voter_id AND b.blocked_id = note_author_id
  ) THEN
    RAISE EXCEPTION 'tip is no longer available' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.community_note_helpful_votes AS v
    WHERE v.note_id = p_note_id AND v.voter_id = p_voter_id
  ) INTO current_vote;

  IF current_vote IS DISTINCT FROM p_helpful THEN
    SELECT count(*)::integer
      INTO recent_changes
    FROM public.community_note_helpful_vote_events AS e
    WHERE e.voter_id = p_voter_id
      AND e.created_at >= now() - interval '24 hours';

    IF recent_changes >= 100 THEN
      RAISE EXCEPTION 'helpful vote rate limit exceeded' USING ERRCODE = 'P0004';
    END IF;

    IF p_helpful THEN
      INSERT INTO public.community_note_helpful_votes (note_id, voter_id)
      VALUES (p_note_id, p_voter_id)
      ON CONFLICT (note_id, voter_id) DO NOTHING;

      INSERT INTO public.community_note_helpful_vote_events (voter_id, note_id, action)
      VALUES (p_voter_id, p_note_id, 'add');
    ELSE
      DELETE FROM public.community_note_helpful_votes
      WHERE note_id = p_note_id AND voter_id = p_voter_id;

      INSERT INTO public.community_note_helpful_vote_events (voter_id, note_id, action)
      VALUES (p_voter_id, p_note_id, 'remove');
    END IF;
  END IF;

  RETURN QUERY
  SELECT n.helpful_count,
    EXISTS (
      SELECT 1
      FROM public.community_note_helpful_votes AS v
      WHERE v.note_id = p_note_id AND v.voter_id = p_voter_id
    )
  FROM public.community_price_notes AS n
  WHERE n.id = p_note_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_community_note_helpful(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_note_helpful(uuid, uuid, boolean) TO service_role;
