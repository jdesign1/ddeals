CREATE INDEX IF NOT EXISTS community_price_notes_published_author_idx
  ON public.community_price_notes (author_id)
  WHERE status = 'approved' AND published_at IS NOT NULL;
