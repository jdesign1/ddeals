-- Accounts Supabase project only.
--
-- Free accounts may save more than five products. The mobile app keeps the
-- first five fully available and renders additional saved products in a
-- locked section until the account has premium access.

BEGIN;

DROP TRIGGER IF EXISTS enforce_watchlist_product_limit ON public.list_items;

COMMIT;
