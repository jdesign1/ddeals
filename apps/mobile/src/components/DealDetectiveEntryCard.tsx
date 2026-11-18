import { Gamepad2 } from "lucide-react";
import type { Ref } from "react";

interface DealDetectiveEntryCardProps {
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
}

export default function DealDetectiveEntryCard({ onClick, buttonRef, className = "" }: DealDetectiveEntryCardProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label="Play Deal Detective"
      className={`flex min-h-[4.5rem] w-full cursor-pointer items-center gap-3 rounded-2xl border border-fair-200 bg-fair-50 px-3 py-3 text-left transition-colors hover:bg-fair-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fair-700 focus-visible:ring-offset-2 ${className}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-fair-800 shadow-xs" aria-hidden="true">
        <Gamepad2 className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block dd-type-control dd-type-control-strong text-fair-900">Deal Detective</span>
        <span className="mt-0.5 block dd-type-meta text-stone-600">Earn points to rank up</span>
      </span>
      <span className="shrink-0 rounded-full bg-fair-800 px-3 py-2 text-xs font-bold text-white">Play</span>
    </button>
  );
}
