import type { CommunityPriceNote } from "@/lib/community-notes-api";
import type { ReactNode } from "react";
import StoreLogoBadge from "@/components/StoreLogoBadge";

const REGION_LABELS: Record<string, string> = {
  northland: "Northland",
  auckland: "Auckland",
  waikato: "Waikato",
  bay_of_plenty: "Bay of Plenty",
  gisborne: "Gisborne",
  hawkes_bay: "Hawke's Bay",
  taranaki: "Taranaki",
  manawatu_whanganui: "Manawatū-Whanganui",
  wellington: "Wellington",
  tasman: "Tasman",
  nelson: "Nelson",
  marlborough: "Marlborough",
  west_coast: "West Coast",
  canterbury: "Canterbury",
  otago: "Otago",
  southland: "Southland",
};

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;
  if (elapsedMs < minuteMs) return "now";
  if (elapsedMs < hourMs) return `${Math.floor(elapsedMs / minuteMs)}m`;
  if (elapsedMs < dayMs) return `${Math.floor(elapsedMs / hourMs)}h`;
  if (elapsedMs < weekMs) return `${Math.floor(elapsedMs / dayMs)}d`;
  if (elapsedMs < monthMs) return `${Math.floor(elapsedMs / weekMs)}w`;
  if (elapsedMs < yearMs) return `${Math.floor(elapsedMs / monthMs)}m`;
  return `${Math.floor(elapsedMs / yearMs)}y`;
}

function formatRegion(value: string): string {
  return REGION_LABELS[value] ?? value.replace(/_/g, " ");
}

function authorInitial(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "S";
}

export default function CommunityNoteAuthor({ note, trailingAction }: { note: CommunityPriceNote; trailingAction?: ReactNode }) {
  const displayName = note.author_display_name_snapshot.trim() || "Community shopper";
  const region = note.region_code ? formatRegion(note.region_code) : null;
  const relativeTime = formatRelativeTime(note.created_at);

  return (
    <div className="flex min-w-0 items-start gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-fair-400 font-display text-lg font-extrabold text-ink-950 ring-2 ring-fair-100" aria-hidden="true">
          {authorInitial(displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-stone-900">{displayName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            {region && <><span className="truncate">{region}</span><span aria-hidden="true">·</span></>}
            {relativeTime && <time dateTime={note.created_at}>{relativeTime}</time>}
          </p>
        </div>
      </div>
      {note.store_name && <StoreLogoBadge store={note.store_name} variant="card" className="mt-1" />}
      {trailingAction}
    </div>
  );
}
