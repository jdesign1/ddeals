"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
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

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-display text-lg font-black tracking-normal text-stone-900">Legal</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            Learn how Dodgy Deal handles your information.
          </p>
        </div>
        <Link
          href="/privacy"
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-sm font-black text-stone-800"
        >
          <span>
            <span className="block">Privacy policy</span>
            <span className="mt-0.5 block text-[13px] font-semibold leading-4 text-stone-500">
              Collection, use, storage, and your privacy rights
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <Link
          href="/terms"
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-sm font-black text-stone-800"
        >
          <span>
            <span className="block">Terms of use</span>
            <span className="mt-0.5 block text-[13px] font-semibold leading-4 text-stone-500">
              Rules for using Dodgy Deal
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
