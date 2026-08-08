"use client";

/** Shared store/tab filter pill — extracted from specials/page.tsx (2026-08-08) for reuse on Home. */
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
      className="shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
      style={
        active
          ? { backgroundColor: "var(--color-brand-primary)", borderColor: "var(--color-brand-primary)", color: "white" }
          : { borderColor: "#eeeae1", color: "#57534e" }
      }
    >
      {label}
    </button>
  );
}
