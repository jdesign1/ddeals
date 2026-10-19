-- Accounts Supabase project only.
--
-- Deal-check history is now read through the authenticated server route. The
-- browser may continue to create its own check rows, but must not be able to
-- bypass the free/premium history limits by selecting the table directly.

revoke all on table public.deal_checks from anon, authenticated;
grant insert on table public.deal_checks to authenticated;

notify pgrst, 'reload schema';
