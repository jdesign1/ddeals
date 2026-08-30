"use client";

import { useRouter } from "next/navigation";
import { useCardLayout } from "@/lib/card-layout-context";
import { usePageHeader } from "@/lib/header-context";

export default function SettingsPage() {
  const router = useRouter();
  const { isGridLayout, setCardLayout } = useCardLayout();
  usePageHeader("Settings", () => router.back());

  return (
    <main className="flex flex-col gap-5 px-5 py-6 pb-10">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h1 className="font-display text-lg font-black tracking-normal text-stone-900">Layout</h1>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            Choose how deal cards are displayed across Check Deals and search.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4">
          <div>
            <p className="text-sm font-black text-stone-900">Grid layout</p>
            <p className="mt-0.5 text-[13px] leading-4 text-stone-500">
              {isGridLayout ? "Grid layout — two cards per row" : "Single layout — one card per row"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isGridLayout}
            aria-label="Grid layout"
            onClick={() => setCardLayout(isGridLayout ? "single" : "grid")}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 ${
              isGridLayout ? "bg-ink-600" : "bg-stone-300"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isGridLayout ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
      </section>
    </main>
  );
}
