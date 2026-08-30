"use client";

import { useRouter } from "next/navigation";
import SupportForm from "@/components/SupportForm";
import { usePageHeader } from "@/lib/header-context";

export default function SupportPage() {
  const router = useRouter();
  usePageHeader("Contact support", () => router.back());

  return (
    <main className="flex flex-col gap-4 px-5 py-5 pb-10">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="font-display text-2xl font-extrabold leading-7 text-stone-900">Contact support</h1>
        <p className="mt-3 text-base leading-7 text-stone-600">
          Tell us what&rsquo;s happening and we&rsquo;ll do our best to help. Include the email address where you&rsquo;d
          like us to reply.
        </p>
      </section>
      <SupportForm mode="support" />
    </main>
  );
}
