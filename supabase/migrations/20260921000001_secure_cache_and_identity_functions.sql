-- Security hardening applied to the Ddeals production database.
--
-- The cache is kept materialized for catalogue performance, but moved out of
-- the API-exposed public schema. The public, filtered wrapper remains the
-- app-facing endpoint.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

do $$
begin
  if to_regclass('public.dodgy_deals_cache') is not null then
    alter materialized view public.dodgy_deals_cache set schema private;
  end if;
end
$$;

revoke all on table private.dodgy_deals_cache from public, anon, authenticated;
grant select on table private.dodgy_deals_cache to anon, authenticated, service_role;

-- Internal scraper/admin RPCs must not be callable through the public API.
revoke execute on function public.release_scraper_product_lock(text, text)
  from public, anon, authenticated;
revoke execute on function public.try_acquire_scraper_product_lock(text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

alter function public.reverse_manual_identity_decision(bigint, text, text)
  set search_path = public, pg_temp;

select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh_dodgy_deals_cache';

select cron.schedule(
  'refresh_dodgy_deals_cache',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY private.dodgy_deals_cache; SELECT public.publish_catalogue_if_changed()$$
);

notify pgrst, 'reload schema';
