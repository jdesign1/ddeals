"use client";

import { useRouter } from "next/navigation";
import SupportForm from "@/components/SupportForm";
import { usePageHeader } from "@/lib/header-context";

export default function ReportDealPage() {
  const router = useRouter();
  usePageHeader("Report an incorrect deal", () => router.back());

  return (
    <main className="flex flex-col gap-5 px-5 py-6 pb-10">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="font-display text-xl font-black text-stone-900">Report an incorrect deal</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Help us keep Dodgy Deal accurate. Use this form if a price, retailer, product detail, or promotion looks
          wrong or out of date.
        </p>
      </section>
      <SupportForm mode="report" />
    </main>
  );
}
