-- Accounts Supabase project only.
--
-- Enforce the first paid-release limits at the database boundary. The mobile
-- UI provides the friendly upgrade prompt, but direct PostgREST writes and
-- scheduled workers must not be able to bypass the same rules.

BEGIN;

-- Internal helper used by security-definer write paths and the Watchlist
-- trigger. It is intentionally not executable by browser roles.
CREATE OR REPLACE FUNCTION public.subscription_entitlement_is_current(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscription_entitlements
    WHERE account_id = p_account_id
      AND entitlement_key = 'premium_access'
      AND status IN ('active', 'grace_period', 'billing_retry')
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.subscription_entitlement_is_current(uuid) FROM PUBLIC, anon, authenticated;

-- RLS policy helper: it exposes only the current caller's boolean state and
-- cannot be used to probe another account's entitlement.
CREATE OR REPLACE FUNCTION public.current_user_has_premium_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.subscription_entitlement_is_current(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.current_user_has_premium_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_premium_access() TO authenticated;

-- Free accounts may save five distinct products across their Watchlist
-- lists. Advisory locking makes the count safe when two product saves arrive
-- at the same time for one account.
CREATE OR REPLACE FUNCTION public.enforce_watchlist_product_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_list_name text;
  v_watchlist_count integer;
  v_product_already_saved boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT l.user_id, lower(btrim(l.name))
    INTO v_user_id, v_list_name
  FROM public.lists AS l
  WHERE l.id = NEW.list_id;

  IF v_user_id IS NULL OR v_list_name <> 'watchlist' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  IF public.subscription_entitlement_is_current(v_user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.list_id = NEW.list_id AND OLD.product_id = NEW.product_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT count(DISTINCT li.product_id),
           bool_or(li.product_id = NEW.product_id)
      INTO v_watchlist_count, v_product_already_saved
    FROM public.list_items AS li
    JOIN public.lists AS l ON l.id = li.list_id
    WHERE l.user_id = v_user_id
      AND lower(btrim(l.name)) = 'watchlist'
      AND li.id <> OLD.id;
  ELSE
    SELECT count(DISTINCT li.product_id),
           bool_or(li.product_id = NEW.product_id)
      INTO v_watchlist_count, v_product_already_saved
    FROM public.list_items AS li
    JOIN public.lists AS l ON l.id = li.list_id
    WHERE l.user_id = v_user_id
      AND lower(btrim(l.name)) = 'watchlist';
  END IF;

  IF coalesce(v_watchlist_count, 0) >= 5 AND NOT coalesce(v_product_already_saved, false) THEN
    RAISE EXCEPTION 'Watchlist limit reached'
      USING DETAIL = 'Free accounts can save up to 5 products. Subscribe to save more.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_watchlist_product_limit ON public.list_items;
CREATE TRIGGER enforce_watchlist_product_limit
  BEFORE INSERT OR UPDATE OF list_id, product_id ON public.list_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_watchlist_product_limit();

-- Price alerts are a paid capability. Keep the existing preference/device
-- APIs, but require a current entitlement before enabling or registering a
-- device. Existing preferences can remain stored after downgrade; the server
-- notification worker separately filters to current premium accounts.
CREATE OR REPLACE FUNCTION public.set_push_notifications_enabled(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_enabled AND NOT public.subscription_entitlement_is_current(v_user_id) THEN
    RAISE EXCEPTION 'Subscription required for price alerts';
  END IF;

  INSERT INTO public.notification_preferences AS current_preference (user_id, push_enabled, push_enabled_at)
  VALUES (v_user_id, p_enabled, CASE WHEN p_enabled THEN now() ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE
  SET push_enabled = EXCLUDED.push_enabled,
      push_enabled_at = CASE
        WHEN EXCLUDED.push_enabled AND NOT current_preference.push_enabled THEN now()
        WHEN EXCLUDED.push_enabled THEN current_preference.push_enabled_at
        ELSE NULL
      END,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.register_push_device(p_token text, p_platform text DEFAULT 'ios')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
  v_registered_user uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.subscription_entitlement_is_current(v_user_id) THEN
    RAISE EXCEPTION 'Subscription required for price alerts';
  END IF;
  IF char_length(v_token) NOT BETWEEN 32 AND 512 OR p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Invalid push device registration';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_preferences
    WHERE user_id = v_user_id AND push_enabled
  ) THEN
    RAISE EXCEPTION 'Push notifications are not enabled';
  END IF;

  INSERT INTO public.push_devices AS registered_device (user_id, token, platform, updated_at)
  VALUES (v_user_id, v_token, p_platform, now())
  ON CONFLICT (token) DO UPDATE
  SET platform = EXCLUDED.platform,
      updated_at = now()
  WHERE registered_device.user_id = EXCLUDED.user_id
  RETURNING user_id INTO v_registered_user;

  IF v_registered_user IS NULL THEN
    RAISE EXCEPTION 'Push token is already associated with another account';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_push_notifications_enabled(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_push_device(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_push_notifications_enabled(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_device(text, text) TO authenticated;

-- Old alert rows must not remain readable as a free premium-data bypass after
-- downgrade. The service-role notification worker remains unaffected.
DROP POLICY IF EXISTS list_price_alert_events_select_own ON public.list_price_alert_events;
CREATE POLICY list_price_alert_events_select_own
  ON public.list_price_alert_events FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id AND public.current_user_has_premium_access());

COMMIT;
