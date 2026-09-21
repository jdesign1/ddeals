-- Keep the deployed app working while it rolls forward to the verified
-- published_dodgy_deals_cache endpoint.
--
-- The compatibility view is read-only and security-invoker. It can be removed
-- once every deployed client uses published_dodgy_deals_cache.

create or replace function private.refresh_verified_specials()
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  latest_run record;
  published_count integer;
begin
  for latest_run in
    select distinct on (source_id)
      source_id,
      id,
      finished_at
    from public.scraper_runs
    where status = 'completed'
      and completeness_status = 'complete'
      and finished_at is not null
    order by source_id, finished_at desc
  loop
    delete from public.published_specials
    where store_id = latest_run.source_id;

    insert into public.published_specials (store_id, product_id)
    select cp.store_id, cp.product_id
    from public.current_prices cp
    join private.dodgy_deals_cache cache
      on cache.store_id = cp.store_id
     and cache.product_id = cp.product_id
    where cp.store_id = latest_run.source_id
      and cp.is_special = true
      and cp.last_seen_special_run_id = latest_run.id;

    get diagnostics published_count = row_count;

    insert into public.store_specials_publications (
      store_id, published_run_id, verified_at, item_count
    )
    values (
      latest_run.source_id,
      latest_run.id,
      latest_run.finished_at,
      published_count
    )
    on conflict (store_id) do update
    set published_run_id = excluded.published_run_id,
        verified_at = excluded.verified_at,
        item_count = excluded.item_count;
  end loop;
end;
$function$;

revoke all on function private.refresh_verified_specials() from public, anon, authenticated;
grant execute on function private.refresh_verified_specials() to service_role;

do $view$
begin
  if to_regclass('public.dodgy_deals_cache') is null then
    execute $sql$
      create view public.dodgy_deals_cache
      with (security_invoker = true)
      as select * from private.dodgy_deals_cache
    $sql$;
  end if;
end
$view$;

grant select on public.dodgy_deals_cache to anon, authenticated, service_role;

select private.refresh_verified_specials();

select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh_dodgy_deals_cache';

select cron.schedule(
  'refresh_dodgy_deals_cache',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY private.dodgy_deals_cache; SELECT private.refresh_verified_specials(); SELECT public.publish_catalogue_if_changed()$$
);

notify pgrst, 'reload schema';
