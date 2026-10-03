import type { DealFilter } from "@/lib/deal-filters";

const DEAL_FILTER_SUMMARY: Record<DealFilter, { label: string; textClass: string; description: string }> = {
  all: {
    label: "All deals",
    textClass: "text-stone-600",
    description: "All current supermarket specials.",
  },
  real: {
    label: "Real Saver Deals",
    textClass: "text-fair-800",
    description: "Specials we've verified are not dodgy.",
  },
  dodgy: {
    label: "Dodgy Deals",
    textClass: "text-alert-800",
    description: "Dodgy specials which you should not buy.",
  },
};

export default function DealFilterSummary({ filter }: { filter: DealFilter }) {
  const summary = DEAL_FILTER_SUMMARY[filter];

  return (
    <div className="space-y-2 pb-1 text-center">
      <span className={`text-base font-bold leading-none ${summary.textClass}`}>{summary.label}</span>
      <p className="text-[13px] leading-4 font-semibold text-stone-600">{summary.description}</p>
    </div>
  );
}
