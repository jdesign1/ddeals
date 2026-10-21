"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import MascotImage from "@/components/MascotImage";
import { useAuth } from "@/lib/auth-context";
import { usePageHeader } from "@/lib/header-context";
import { useSubscriptions } from "@/lib/subscription-context";

const SUBSCRIPTION_BENEFITS = [
  "Unlimited Watchlist items",
  "Automatic price-drop alerts",
  "Alerts for genuinely good deals",
  "Custom alert preferences",
];

export default function SubscribePage() {
  const router = useRouter();
  const { user, loading: authLoading, openAuthSheet } = useAuth();
  const { isPremium, loading: subscriptionLoading, openSubscriptionSheet } = useSubscriptions();

  usePageHeader("Subscribe", () => router.back());

  if (authLoading) {
    return <main className="flex min-h-full items-center justify-center px-5 py-10" aria-busy="true" />;
  }

  const handleSubscribe = () => {
    if (!user) {
      openAuthSheet("Create a free account before subscribing.");
      return;
    }
    openSubscriptionSheet();
  };

  return (
    <main className="flex flex-col gap-4 px-5 py-5 pb-10">
      <section className="flex flex-col gap-5 rounded-3xl border border-fair-200 bg-fair-50 p-5 shadow-sm" aria-labelledby="subscribe-page-title">
        <div className="flex justify-center">
          <MascotImage
            src="/subscribe-mascot-thumbs-up.webp"
            darkSrc="/subscribe-mascot-thumbs-up.webp"
            alt="Dodgy Deal mascot giving two thumbs up"
            width={512}
            height={532}
            sizes="176px"
            unoptimized
            className="mascot-wave h-auto w-full max-w-[11rem]"
          />
        </div>
        <div className="text-center">
          <p className="dd-type-meta dd-type-meta-strong uppercase tracking-[0.08em] text-fair-800">Dodgy Deal Plus</p>
          <h1 id="subscribe-page-title" className="mt-1 dd-type-section text-stone-900">
            {isPremium ? "Your subscription is active" : "Subscribe for unlimited Watchlist items"}
          </h1>
          <p className="mt-2 dd-type-body text-stone-600">
            {isPremium
              ? "Your subscription keeps your Watchlist unlimited and your price alerts active."
              : "Save up to 5 items with a free account, or subscribe to save unlimited items and receive price alerts."}
          </p>
        </div>
        <ul className="space-y-2" aria-label="Subscription benefits">
          {SUBSCRIPTION_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <Check className="h-4 w-4 shrink-0 text-fair-700" aria-hidden="true" />
              {benefit}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={subscriptionLoading}
          className="dd-btn dd-btn-primary w-full cursor-pointer disabled:cursor-wait disabled:opacity-60"
        >
          {subscriptionLoading ? "Checking subscription…" : !user ? "Log in to subscribe" : isPremium ? "View subscription" : "See subscription options"}
        </button>
      </section>
    </main>
  );
}
