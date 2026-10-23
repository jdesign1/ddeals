-- Atomic pending-note submission.
--
-- The API route verifies the caller and validates the catalogue/product input.
-- This function owns the write, duplicate check, and per-account quota inside
-- one transaction so concurrent requests cannot bypass the quota.

create or replace function public.submit_community_price_note(
  p_author_id uuid,
  p_product_id uuid,
  p_source_store_id text,
  p_price numeric,
  p_observed_on date,
  p_region_code text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent_hour_count integer;
  recent_day_count integer;
  resolved_store_name text;
begin
  if p_author_id is null or p_product_id is null then
    raise exception 'invalid note owner or product' using errcode = 'P0003';
  end if;

  resolved_store_name := case p_source_store_id
    when 'newworld' then 'New World'
    when 'paknsave' then 'PAK''nSAVE'
    when 'woolworths' then 'Woolworths'
    when 'foursquare' then 'Four Square'
    when 'supervalue' then 'SuperValue'
    when 'chemistwarehouse' then 'Chemist Warehouse'
    else null
  end;
  if resolved_store_name is null then
    raise exception 'invalid supermarket' using errcode = 'P0003';
  end if;

  -- Serialize submissions for one account. Different accounts can still
  -- submit concurrently, while one account cannot race its own quota.
  perform pg_advisory_xact_lock(hashtextextended(p_author_id::text, 0));

  select count(*)::integer into recent_hour_count
  from public.community_price_notes
  where author_id = p_author_id
    and created_at >= now() - interval '1 hour';

  select count(*)::integer into recent_day_count
  from public.community_price_notes
  where author_id = p_author_id
    and created_at >= now() - interval '1 day';

  if recent_hour_count >= 3 or recent_day_count >= 10 then
    raise exception 'community note rate limit exceeded' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.community_price_notes
    where author_id = p_author_id
      and product_id = p_product_id
      and source_store_id = p_source_store_id
      and price = p_price
      and observed_on = p_observed_on
      and status in ('pending', 'approved')
  ) then
    raise exception 'duplicate community note' using errcode = 'P0002';
  end if;

  insert into public.community_price_notes (
    product_id,
    source_store_id,
    store_name,
    price,
    observed_on,
    region_code,
    body,
    author_id,
    status
  ) values (
    p_product_id,
    p_source_store_id,
    resolved_store_name,
    p_price,
    p_observed_on,
    p_region_code,
    p_body,
    p_author_id,
    'pending'
  );
end;
$$;

revoke all on function public.submit_community_price_note(uuid, uuid, text, numeric, date, text, text) from public, anon, authenticated;
grant execute on function public.submit_community_price_note(uuid, uuid, text, numeric, date, text, text) to service_role;

notify pgrst, 'reload schema';
