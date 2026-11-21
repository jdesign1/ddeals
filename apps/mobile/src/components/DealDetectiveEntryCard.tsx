import { ArrowRight, Search, Store } from "lucide-react";
import type { Ref } from "react";

interface DealDetectiveEntryCardProps {
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
  eyebrow?: string;
  variant?: "detective" | "showdown";
}

export default function DealDetectiveEntryCard({
  onClick,
  buttonRef,
  className = "",
  title = "Deal Detective",
  description = "Earn points to rank up",
  buttonLabel = "Play",
  eyebrow = "DAILY CASE",
  variant = "detective",
}: DealDetectiveEntryCardProps) {
  const isShowdown = variant === "showdown";
  const GameIcon = isShowdown ? Store : Search;
  const accent = isShowdown
    ? {
        card: "border-amber-200 bg-amber-50/70 hover:bg-amber-50",
        icon: "bg-amber-100 text-amber-900",
        eyebrow: "text-amber-800",
        action: "bg-stone-900 text-white",
        focus: "focus-visible:ring-amber-700",
      }
    : {
        card: "border-fair-200 bg-fair-50 hover:bg-fair-100/70",
        icon: "bg-white text-fair-800",
        eyebrow: "text-fair-800",
        action: "bg-stone-900 text-white",
        focus: "focus-visible:ring-fair-700",
      };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={`${buttonLabel} ${title}`}
      className={`group flex min-h-[6.25rem] w-full cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 text-left shadow-xs transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${accent.card} ${accent.focus} ${className}`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-xs ${accent.icon}`} aria-hidden="true">
        <GameIcon className="h-6 w-6" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className={`mb-1 block text-[0.625rem] font-extrabold uppercase tracking-[0.12em] ${accent.eyebrow}`}>{eyebrow}</span>
        <span className="block dd-type-control dd-type-control-strong text-stone-900">{title}</span>
        <span className="mt-0.5 block dd-type-meta leading-5 text-stone-600">{description}</span>
      </span>
      <span className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold ${accent.action}`}>
        {buttonLabel}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </button>
  );
}
