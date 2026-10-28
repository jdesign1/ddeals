-- Accounts Supabase project only.
-- Keep free in-app alert access limited to the five eligible products in the
-- user's named Watchlist, even when that same product is saved in another list.

BEGIN;

DROP POLICY IF EXISTS list_price_alert_events_select_own ON public.list_price_alert_events;
CREATE POLICY list_price_alert_events_select_own
  ON public.list_price_alert_events FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = user_id
    AND (
      (select public.current_user_has_premium_access())
      OR (
        list_id IN (
          SELECT l.id
          FROM public.lists AS l
          WHERE l.user_id = (select auth.uid())
            AND lower(btrim(l.name)) = 'watchlist'
        )
        AND product_id IN (
          SELECT entitled.product_id
          FROM (
            SELECT DISTINCT ON (li.product_id)
              li.product_id,
              li.added_at,
              li.id
            FROM public.list_items AS li
            JOIN public.lists AS l ON l.id = li.list_id
            WHERE l.user_id = (select auth.uid())
              AND lower(btrim(l.name)) = 'watchlist'
            ORDER BY li.product_id, li.added_at DESC, li.id DESC
          ) AS entitled
          ORDER BY entitled.added_at DESC, entitled.product_id, entitled.id DESC
          LIMIT 5
        )
      )
    )
  );

COMMIT;
