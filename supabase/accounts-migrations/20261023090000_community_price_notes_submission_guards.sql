-- Community note submission guards.
--
-- The route performs the user-facing validation and rate-limit checks. These
-- indexes provide the database-level protection that a pair of concurrent
-- requests cannot bypass those checks for the same note.

create unique index if not exists community_price_notes_pending_duplicate_idx
  on public.community_price_notes (author_id, product_id, source_store_id, price, observed_on)
  where status in ('pending', 'approved');

create index if not exists community_price_notes_author_created_idx
  on public.community_price_notes (author_id, created_at desc);

notify pgrst, 'reload schema';
