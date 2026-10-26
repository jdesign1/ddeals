"use client";

import { LoaderCircle, ThumbsUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { setCommunityPriceNoteHelpful, type CommunityPriceNote } from "@/lib/community-notes-api";

export default function CommunityHelpfulButton({
  note,
  onChanged,
}: {
  note: CommunityPriceNote;
  onChanged: (noteId: string, helpful: boolean, helpfulCount: number) => void;
}) {
  const pathname = usePathname();
  const { user, session, isAnonymousSession, openAuthSheet } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (note.is_own_note) return null;

  async function handleHelpful() {
    if (!user || isAnonymousSession || !session?.access_token) {
      openAuthSheet("Log in to mark a shopper tip as helpful. After signing in, return here and tap Helpful again.", pathname);
      return;
    }

    setPending(true);
    setError(null);
    try {
      const nextHelpful = !note.viewer_has_helpful_vote;
      const result = await setCommunityPriceNoteHelpful(note.id, nextHelpful, session.access_token);
      onChanged(note.id, result.viewer_has_helpful_vote, result.helpful_count);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "We couldn't update that helpful vote right now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void handleHelpful()}
        disabled={pending}
        aria-pressed={note.viewer_has_helpful_vote}
        aria-busy={pending}
        aria-label={note.viewer_has_helpful_vote ? "Remove your helpful vote from this shopper tip" : "Mark this shopper tip as helpful"}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fair-400 disabled:cursor-wait disabled:opacity-60 ${note.viewer_has_helpful_vote ? "border-fair-500 bg-fair-50 text-fair-800" : "border-stone-300 bg-white text-stone-700 hover:border-fair-400 hover:bg-fair-50"}`}
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ThumbsUp className={`h-4 w-4 ${note.viewer_has_helpful_vote ? "fill-fair-600" : ""}`} aria-hidden="true" />}
        <span>Helpful</span>
        <span aria-label={`${note.helpful_count} helpful ${note.helpful_count === 1 ? "vote" : "votes"}`}>({note.helpful_count})</span>
      </button>
      {error && <span className="dd-type-meta text-alert-600" role="alert">{error}</span>}
    </div>
  );
}
