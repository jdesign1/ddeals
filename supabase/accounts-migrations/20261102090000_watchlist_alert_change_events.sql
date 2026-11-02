-- Accounts Supabase project only.
--
-- Store the previous verdict so a verdict-change alert can explain the
-- transition. The worker continues to use the existing event_key for
-- idempotency and emits separate price_changed and verdict_changed rows when
-- both signals change in the same catalogue observation.

BEGIN;

ALTER TABLE public.list_price_alert_events
  ADD COLUMN IF NOT EXISTS previous_verdict text;

-- The notification worker already relies on event_key for idempotent upserts.
-- Make that guarantee explicit for the new event types as well.
CREATE UNIQUE INDEX IF NOT EXISTS list_price_alert_events_event_key_uidx
  ON public.list_price_alert_events (event_key);

-- Keep legacy rows readable while allowing the generic change events emitted
-- by the refreshed worker. Drop any prior event_type check regardless of its
-- generated constraint name so this remains safe across the original account
-- schema variants.
DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.list_price_alert_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.list_price_alert_events DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.list_price_alert_events
  ADD CONSTRAINT list_price_alert_events_event_type_check
  CHECK (event_type IN (
    'price_changed',
    'verdict_changed',
    'returned_to_special',
    'better_special_price',
    'became_real_saver',
    'became_dodgy',
    'dodgy_special'
  ));

NOTIFY pgrst, 'reload schema';

COMMIT;
