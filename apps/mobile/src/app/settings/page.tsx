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
    <main className="flex flex-col gap-4 px-5 py-5 pb-10">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h1 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Layout</h1>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Choose how deal cards are displayed across Check Deals and search.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4">
          <div>
            <p className="text-[15px] font-semibold leading-5 text-stone-900">Grid layout</p>
            <p className="mt-1 text-[13px] leading-5 text-stone-500">
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
          <h2 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Legal</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Learn how Dodgy Deal handles your information.
          </p>
        </div>
        <Link
          href="/privacy"
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800"
        >
          <span>
            <span className="block">Privacy policy</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Collection, use, storage, and your privacy rights
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <Link
          href="/terms"
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800"
        >
          <span>
            <span className="block">Terms of use</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Rules for using Dodgy Deal
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-display text-[17px] font-extrabold tracking-normal text-stone-900">Help</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Get help or let us know when something needs fixing.
          </p>
        </div>
        <Link
          href="/support"
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800"
        >
          <span>
            <span className="block">Contact support</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Get help with the app
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <Link
          href="/report-deal"
          className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800"
        >
          <span>
            <span className="block">Report an incorrect deal</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Help us keep prices and specials accurate
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" aria-hidden="true" />
        </Link>
        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-4 text-[15px] font-semibold leading-5 text-stone-800">
          <span>
            <span className="block">App version</span>
            <span className="mt-1 block text-[13px] font-normal leading-5 text-stone-500">
              Dodgy Deal mobile app
            </span>
          </span>
          <span className="text-[13px] font-semibold tabular-nums text-stone-500">0.1.0</span>
        </div>
      </section>
    </main>
  );
}
