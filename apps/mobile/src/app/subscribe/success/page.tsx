"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import MascotImage from "@/components/MascotImage";
import { usePageHeader } from "@/lib/header-context";
import { useSubscriptions } from "@/lib/subscription-context";

export default function SubscriptionSuccessPage() {
  const router = useRouter();
  const { isPremium, loading } = useSubscriptions();
  usePageHeader("Subscription active", () => router.back());

  useEffect(() => {
    if (!loading && !isPremium) router.replace("/subscribe");
  }, [isPremium, loading, router]);

  if (loading || !isPremium) {
    return <main className="flex min-h-full items-center justify-center px-5 py-10" aria-busy="true" />;
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-5 py-10 pb-safe-nav">
      <section className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-fair-200 bg-fair-50 px-5 py-8 text-center shadow-sm" aria-labelledby="subscription-success-title">
        <MascotImage
          src="/subscribe-mascot-thumbs-up.webp"
          darkSrc="/subscribe-mascot-thumbs-up.webp"
          alt="Dodgy Deal mascot celebrating"
          width={512}
          height={532}
          sizes="144px"
          unoptimized
          className="mascot-wave h-auto w-36"
        />
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="h-12 w-12 text-fair-700" aria-hidden="true" />
          <h1 id="subscription-success-title" className="dd-type-section text-stone-900">You&rsquo;re subscribed</h1>
          <p className="dd-type-body text-stone-600">Your subscription is active and your paid features are now unlocked.</p>
        </div>
        <p className="dd-type-secondary text-stone-600">Your watchlist, all checks and deal stats are no longer limited.</p>
        <button type="button" onClick={() => router.replace("/")} className="dd-btn dd-btn-primary w-full cursor-pointer">Continue</button>
      </section>
    </main>
  );
}
