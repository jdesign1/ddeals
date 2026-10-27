-- Accounts Supabase project only.
--
-- A short-lived claim prevents overlapping notification cron runs from
-- delivering the same alert twice. Claims are released after a successful
-- send, or become eligible again after the worker's lease period.

BEGIN;

ALTER TABLE public.list_price_alert_events
  ADD COLUMN IF NOT EXISTS push_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS list_price_alert_events_pending_push_idx
  ON public.list_price_alert_events (push_claimed_at, created_at)
  WHERE push_sent_at IS NULL;

COMMIT;
