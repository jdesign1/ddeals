"use client";

import WinkMascot from "@/components/WinkMascot";

export default function LoggedOutAccountCard({
  onClick,
  showNotificationDot,
}: {
  onClick: () => void;
  showNotificationDot: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex min-h-[76px] w-full items-center gap-3 rounded-2xl bg-stone-50 px-4 py-2.5 text-left transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
    >
      <WinkMascot className="wink-mascot--account-prompt mascot-wave" />
      <span>
        <span className="block dd-type-control font-semibold text-stone-900">Create account or log in</span>
        <span className="block dd-type-meta text-stone-500">Save lists and preferences</span>
      </span>
      {showNotificationDot && (
        <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-alert-600 ring-2 ring-stone-50" aria-hidden="true" />
      )}
    </button>
  );
}
