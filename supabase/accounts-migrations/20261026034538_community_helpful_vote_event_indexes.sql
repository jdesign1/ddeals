-- Support cascade cleanup and moderation lookups for the vote audit trail.
CREATE INDEX IF NOT EXISTS community_note_helpful_vote_events_note_idx
  ON public.community_note_helpful_vote_events (note_id, created_at DESC);
