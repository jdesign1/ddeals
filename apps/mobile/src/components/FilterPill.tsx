"use client";

/** Shared store/tab filter pill — extracted from specials/page.tsx (2026-08-08) for reuse on Home. */
// Border swapped for a short/tight shadow, 2026-08-21, per Jay: "Update the
// pills and tabs to have no border lines, and short tight drop shadows
// instead." `borderColor` dropped from both style branches (nothing left to
// color), `shadow-sm` added as the pill's own resting elevation instead --
// same "border line -> short drop shadow" swap already applied to
// `ListCard` in `app/lists/page.tsx` (2026-08-15), reused here for
// consistency rather than picking a different shadow token.
export default function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="shrink-0 rounded-full px-3.5 py-1.5 dd-type-control shadow-sm"
      style={active ? { backgroundColor: "var(--color-brand-primary)", color: "white" } : { color: "#57534e" }}
    >
      {label}
    </button>
  );
}
