"use client";

import { ExternalLink, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { SUBSCRIPTION_PRODUCT_IDS } from "@dodgey-deals/shared";
import MascotImage from "@/components/MascotImage";
import { useAuth } from "@/lib/auth-context";
import { usePageHeader } from "@/lib/header-context";
import { useSubscriptions } from "@/lib/subscription-context";
import {
  formatSubscriptionDate,
  getSubscriptionPlanLabel,
  getSubscriptionRenewalLabel,
  getSubscriptionStatusLabel,
} from "@/lib/subscription-display";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

const SUBSCRIPTION_BENEFITS = [
  "Unlimited Watchlist items",
  "Automatic price-drop alerts",
  "Alerts for genuinely good deals",
  "Custom alert preferences",
];

export default function SubscribePage() {
  const router = useRouter();
  const { user, loading: authLoading, openAuthSheet } = useAuth();
  const {
    isPremium,
    loading: subscriptionLoading,
    productsLoading,
    busyProductId,
    error,
    products,
    isNativeAvailable,
    currentSubscription,
    purchase,
  } = useSubscriptions();

  usePageHeader("Subscribe", () => router.back());

  if (authLoading) {
    return <main className="flex min-h-full items-center justify-center px-5 py-10" aria-busy="true" />;
  }

  const accessUntil = formatSubscriptionDate(currentSubscription?.expires_at);
  const showPurchaseOptions = Boolean(user && !isPremium && isNativeAvailable);
  const purchaseOptionsLoading = subscriptionLoading || productsLoading;

  return (
    <main className="flex flex-col gap-4 px-5 py-5 pb-safe-nav">
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
      </section>

      {isPremium && currentSubscription ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm" aria-labelledby="current-subscription-title">
          <div>
            <p className="dd-type-meta dd-type-meta-strong text-stone-500">Current plan</p>
            <h2 id="current-subscription-title" className="mt-1 dd-type-section text-stone-900">
              {getSubscriptionPlanLabel(currentSubscription.product_id)}
            </h2>
            <p className="mt-1 text-sm font-semibold text-ink-700">{getSubscriptionStatusLabel(currentSubscription.status)}</p>
          </div>
          <div className="border-t border-stone-100 pt-4 text-sm leading-6 text-stone-600">
            {accessUntil && <p>Access continues until {accessUntil}.</p>}
            <p>{getSubscriptionRenewalLabel(currentSubscription.product_id)}.</p>
          </div>
          <a
            href={APPLE_SUBSCRIPTIONS_URL}
            target="_blank"
            rel="noreferrer"
            className="dd-btn dd-btn-outline flex w-full items-center justify-center gap-2"
          >
            Manage or cancel in Apple
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="text-xs leading-5 text-stone-500">
            If you cancel, your access stays active until the end of the current {currentSubscription.product_id === SUBSCRIPTION_PRODUCT_IDS.annual ? "annual" : "monthly"} period.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="subscription-options-title">
          <div>
            <h2 id="subscription-options-title" className="dd-type-section text-stone-900">Choose your plan</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">Apple handles payment and renews your plan automatically unless you cancel.</p>
          </div>

          {!user && (
            <button
              type="button"
              onClick={() => openAuthSheet("Create a free account before subscribing.")}
              className="dd-btn dd-btn-primary w-full cursor-pointer"
            >
              Log in to subscribe
            </button>
          )}

          {user && !isNativeAvailable && (
            <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
              Subscription purchases are available in the iOS app. Open Dodgy Deal on your iPhone, sign in with this account, and return here to choose a plan.
            </p>
          )}

          {showPurchaseOptions && (
            <div className="flex flex-col gap-3">
              {purchaseOptionsLoading ? (
                <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600" aria-busy="true">Loading subscription options…</p>
              ) : products.length > 0 ? (
                products.map((product) => {
                  const isAnnual = product.id === SUBSCRIPTION_PRODUCT_IDS.annual;
                  const isBusy = busyProductId === product.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => void purchase(product.id)}
                      disabled={busyProductId !== null}
                      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-4 text-left shadow-xs transition-colors hover:border-ink-300 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 disabled:cursor-wait disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block text-base font-bold text-stone-900">{isAnnual ? "Annual plan" : "Monthly plan"}</span>
                        <span className="mt-1 block text-sm leading-5 text-stone-500">{product.description || (isAnnual ? "Renews once a year" : "Renews each month")}</span>
                      </span>
                      <span className="shrink-0 text-base font-bold text-ink-800">{isBusy ? "Starting…" : product.displayPrice}</span>
                    </button>
                  );
                })
              ) : (
                <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
                  {error ?? "Subscription options are temporarily unavailable. Please try again later."}
                </p>
              )}
            </div>
          )}

          {error && products.length > 0 && <p role="status" className="text-sm leading-5 text-alert-700">{error}</p>}
          {user && isNativeAvailable && <p className="text-xs leading-5 text-stone-500">Payment is processed securely by Apple. You can manage renewal or cancellation in your Apple account settings.</p>}
        </section>
      )}
    </main>
  );
}
