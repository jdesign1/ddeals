import type { DealFilter } from "@/lib/deal-filters";

const DEAL_FILTER_SUMMARY: Record<DealFilter, { label: string; textClass: string; description: string }> = {
  all: {
    label: "All deals",
    textClass: "text-stone-600",
    description: "All current supermarket specials.",
  },
  real: {
    label: "Real Saver",
    textClass: "text-fair-800",
    description: "Real saver and fair-price specials.",
  },
  dodgy: {
    label: "Dodgy",
    textClass: "text-alert-800",
    description: "Confirmed Dodgy deals and potentially dodgy",
  },
};

export default function DealFilterSummary({ filter }: { filter: DealFilter }) {
  const summary = DEAL_FILTER_SUMMARY[filter];

  return (
    <div className="space-y-2 pb-1 text-center">
      <span className={`text-sm font-bold leading-none ${summary.textClass}`}>{summary.label}</span>
      <p className="text-[13px] leading-4 font-semibold text-stone-600">{summary.description}</p>
    </div>
  );
}
