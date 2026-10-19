-- Accounts Supabase project only.
--
-- The Watchlist limit function is invoked by PostgreSQL as a trigger. It is
-- not an application RPC and must not be callable through PostgREST.

REVOKE ALL ON FUNCTION public.enforce_watchlist_product_limit() FROM PUBLIC, anon, authenticated;
