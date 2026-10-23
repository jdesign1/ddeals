-- Accounts Supabase project only.
--
-- Community price notes are deliberately separate from the catalogue and
-- official deal-assessment data. The first app slice only reads approved
-- notes through a server route; trusted server code will own moderation and
-- all future writes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.community_price_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  source_store_id text NOT NULL CHECK (char_length(btrim(source_store_id)) BETWEEN 1 AND 120),
  store_name text NOT NULL CHECK (char_length(btrim(store_name)) BETWEEN 1 AND 120),
  price numeric(10, 2) NOT NULL CHECK (price > 0 AND price <= 100000),
  observed_on date NOT NULL,
  region_code text CHECK (
    region_code IS NULL OR region_code IN (
      'northland', 'auckland', 'waikato', 'bay_of_plenty', 'gisborne',
      'hawkes_bay', 'taranaki', 'manawatu_whanganui', 'wellington',
      'tasman', 'nelson', 'marlborough', 'west_coast', 'canterbury',
      'otago', 'southland'
    )
  ),
  body text CHECK (body IS NULL OR char_length(btrim(body)) BETWEEN 1 AND 500),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_display_name_snapshot text NOT NULL DEFAULT 'Community shopper'
    CHECK (char_length(btrim(author_display_name_snapshot)) BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'hidden', 'deleted')),
  moderation_reason text,
  moderated_at timestamptz,
  moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  helpful_count integer NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_price_notes_approved_is_published
    CHECK (status <> 'approved' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS community_price_notes_product_feed_idx
  ON public.community_price_notes (product_id, status, observed_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS community_price_notes_author_idx
  ON public.community_price_notes (author_id);
CREATE INDEX IF NOT EXISTS community_price_notes_moderated_by_idx
  ON public.community_price_notes (moderated_by);

CREATE TABLE IF NOT EXISTS public.community_note_helpful_votes (
  note_id uuid NOT NULL REFERENCES public.community_price_notes(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, voter_id)
);
CREATE INDEX IF NOT EXISTS community_note_helpful_votes_voter_idx
  ON public.community_note_helpful_votes (voter_id);

CREATE TABLE IF NOT EXISTS public.community_note_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.community_price_notes(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'wrong_price', 'abuse', 'personal_information', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS community_note_reports_reporter_idx
  ON public.community_note_reports (reporter_id);
CREATE INDEX IF NOT EXISTS community_note_reports_reviewed_by_idx
  ON public.community_note_reports (reviewed_by);

CREATE TABLE IF NOT EXISTS public.community_user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS community_user_blocks_blocked_idx
  ON public.community_user_blocks (blocked_id);

ALTER TABLE public.community_price_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_note_helpful_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_note_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_user_blocks ENABLE ROW LEVEL SECURITY;

-- Keep the base tables closed to direct browser reads and writes. The app's
-- server route uses the service role to select only public-safe columns and
-- can later apply block/report filtering without exposing moderation fields.
REVOKE ALL ON TABLE public.community_price_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_price_notes TO service_role;

REVOKE ALL ON TABLE public.community_note_helpful_votes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_note_helpful_votes TO service_role;

REVOKE ALL ON TABLE public.community_note_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_note_reports TO service_role;

REVOKE ALL ON TABLE public.community_user_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_user_blocks TO service_role;

-- Keep the displayed count consistent with the trusted vote rows. No client
-- role can execute this function or write the vote table directly.
CREATE OR REPLACE FUNCTION public.refresh_community_note_helpful_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.community_price_notes
    SET helpful_count = GREATEST(0, helpful_count - 1), updated_at = now()
    WHERE id = OLD.note_id;
    RETURN OLD;
  END IF;

  UPDATE public.community_price_notes
  SET helpful_count = helpful_count + 1, updated_at = now()
  WHERE id = NEW.note_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_community_note_helpful_count() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_community_price_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Auth account deletion sets author_id to NULL. Retain the useful price
  -- sighting, but remove the author's alias and free-form text with it.
  IF TG_OP = 'UPDATE' AND OLD.author_id IS NOT NULL AND NEW.author_id IS NULL THEN
    NEW.author_display_name_snapshot := 'Deleted shopper';
    NEW.body := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_community_price_notes_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS community_price_notes_set_updated_at ON public.community_price_notes;
CREATE TRIGGER community_price_notes_set_updated_at
  BEFORE UPDATE ON public.community_price_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_community_price_notes_updated_at();

DROP TRIGGER IF EXISTS community_note_helpful_count_after_insert ON public.community_note_helpful_votes;
CREATE TRIGGER community_note_helpful_count_after_insert
  AFTER INSERT ON public.community_note_helpful_votes
  FOR EACH ROW EXECUTE FUNCTION public.refresh_community_note_helpful_count();

DROP TRIGGER IF EXISTS community_note_helpful_count_after_delete ON public.community_note_helpful_votes;
CREATE TRIGGER community_note_helpful_count_after_delete
  AFTER DELETE ON public.community_note_helpful_votes
  FOR EACH ROW EXECUTE FUNCTION public.refresh_community_note_helpful_count();

NOTIFY pgrst, 'reload schema';

COMMIT;
