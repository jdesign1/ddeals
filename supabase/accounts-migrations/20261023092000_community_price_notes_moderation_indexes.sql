-- Keep the operator queue and report inbox fast as community usage grows.
BEGIN;

CREATE INDEX IF NOT EXISTS community_price_notes_pending_queue_idx
  ON public.community_price_notes (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS community_note_reports_open_queue_idx
  ON public.community_note_reports (created_at ASC)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.community_moderators (
  account_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'moderator' CHECK (role IN ('moderator', 'admin')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_moderators_active_idx
  ON public.community_moderators (account_id)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.community_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid REFERENCES public.community_price_notes(id) ON DELETE SET NULL,
  report_id uuid REFERENCES public.community_note_reports(id) ON DELETE SET NULL,
  moderator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('approve', 'reject', 'hide', 'dismiss_report')),
  previous_status text,
  new_status text,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (note_id IS NOT NULL OR report_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS community_moderation_actions_note_idx
  ON public.community_moderation_actions (note_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_moderation_actions_report_idx
  ON public.community_moderation_actions (report_id, created_at DESC);

ALTER TABLE public.community_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_moderation_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.community_moderators FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_moderators TO service_role;

REVOKE ALL ON TABLE public.community_moderation_actions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_moderation_actions TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
