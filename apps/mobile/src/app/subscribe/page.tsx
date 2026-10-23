"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BellRing,
  Check,
  ExternalLink,
  HeartHandshake,
  ListPlus,
  LoaderCircle,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
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

const SUBSCRIPTION_BENEFITS: { label: string; detail: string; icon: LucideIcon }[] = [
  {
    label: "Unlimited watchlist items",
    detail: "Keep every product you want to watch in one place.",
    icon: ListPlus,
  },
  {
    label: "Full access to all checks",
    detail: "See your complete deal-check history, not just the latest few.",
    icon: ScanSearch,
  },
  {
    label: "Full access to deal stats and insights",
    detail: "Understand your savings, patterns and best supermarket finds.",
    icon: BarChart3,
  },
  {
    label: "Price-drop alerts",
    detail: "Get notified when watched products become better value.",
    icon: BellRing,
  },
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
  const [selectedProductId, setSelectedProductId] = useState<string>(SUBSCRIPTION_PRODUCT_IDS.monthly);

  usePageHeader("Subscribe", () => router.back());

  if (authLoading) {
    return <main className="flex min-h-full items-center justify-center px-5 py-10" aria-busy="true" />;
  }

  const accessUntil = formatSubscriptionDate(currentSubscription?.expires_at);
  const showPurchaseOptions = Boolean(user && !isPremium && isNativeAvailable);
  const purchaseOptionsLoading = subscriptionLoading || productsLoading;
  const selectedProduct = products.find((product) => product.id === selectedProductId)
    ?? products.find((product) => product.id === SUBSCRIPTION_PRODUCT_IDS.monthly)
    ?? products[0]
    ?? null;

  return (
    <main className="flex flex-col gap-4 bg-fair-50/70 px-5 py-5 pb-safe-nav">
      <section className="relative flex flex-col gap-5 overflow-hidden rounded-[2rem] border border-fair-100 bg-white px-5 pb-6 pt-4 shadow-sm" aria-labelledby="subscribe-page-title">
        <div className="relative flex justify-center">
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
        <div className="relative text-center">
          <p className="font-display text-[1.45rem] font-extrabold leading-tight tracking-[-0.04em] text-ink-950">Dodgy Deal <span className="text-fair-800">Plus</span></p>
          <h1 id="subscribe-page-title" className="mx-auto mt-3 max-w-[18rem] text-[1.35rem] font-extrabold leading-tight tracking-[-0.02em] text-stone-900">
            {isPremium ? "Your subscription is active" : "More savings. Less guesswork."}
          </h1>
          <p className="mx-auto mt-2 max-w-[20rem] dd-type-body text-stone-600">
            {isPremium
              ? "Your subscription keeps your watchlist unlimited and your price alerts active."
              : "Unlock the full Dodgy Deal picture across your watchlist, deal history and savings insights."}
          </p>
        </div>
        <ul className="relative grid gap-2.5" aria-label="Subscription benefits">
          {SUBSCRIPTION_BENEFITS.map((benefit) => {
            const BenefitIcon = benefit.icon;
            return (
              <li key={benefit.label} className="flex items-start gap-3 rounded-2xl border border-stone-100 bg-stone-50/70 px-3.5 py-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fair-100 text-fair-800" aria-hidden="true">
                  <BenefitIcon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
                </span>
                <span className="min-w-0">
                  <span className="block dd-type-control text-stone-800">{benefit.label}</span>
                  <span className="mt-0.5 block dd-type-meta text-stone-600">{benefit.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {!isPremium && (
          <div className="relative flex items-start gap-3 border-t border-stone-100 pt-4">
            <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-fair-800" aria-hidden="true" />
            <p className="dd-type-meta text-stone-600">
              Your subscription helps us support and maintain the app, keep the deal data useful, and continue improving Dodgy Deal.
            </p>
          </div>
        )}
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
        <section className="flex flex-col gap-4 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="subscription-options-title">
          <div className="text-center">
            <h2 id="subscription-options-title" className="dd-type-section text-stone-900">Choose your plan</h2>
            <p className="mt-1 dd-type-secondary text-stone-600">Start with the plan that suits your shopping rhythm.</p>
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
            <div className="flex flex-col gap-6">
              {purchaseOptionsLoading ? (
                <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600" aria-busy="true">Loading subscription options…</p>
              ) : products.length > 0 ? (
                <>
                  <fieldset>
                    <legend className="sr-only">Choose a subscription plan</legend>
                    <div className={products.length > 1 ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
                      {products.map((product) => {
                        const isAnnual = product.id === SUBSCRIPTION_PRODUCT_IDS.annual;
                        const isSelected = selectedProduct?.id === product.id;
                        return (
                          <label
                            key={product.id}
                            className="cursor-pointer"
                          >
                            <input
                              type="radio"
                              name="subscription-plan"
                              value={product.id}
                              checked={isSelected}
                              onChange={() => setSelectedProductId(product.id)}
                              disabled={busyProductId !== null}
                              aria-label={["Select the", isAnnual ? "annual" : "monthly", "plan for", product.displayPrice].join(" ")}
                              className="peer sr-only"
                            />
                            <span
                              className={[
                                "relative flex min-h-[7.25rem] flex-col items-start justify-between rounded-2xl border px-3 py-3.5 text-left transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink-700",
                                isSelected ? "border-fair-400 bg-fair-50 ring-2 ring-fair-200" : "border-stone-200 bg-white hover:border-ink-300 hover:bg-stone-50",
                                busyProductId !== null ? "cursor-wait opacity-60" : "",
                              ].join(" ")}
                            >
                              {isSelected && (
                                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-fair-600 text-white" aria-hidden="true">
                                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                </span>
                              )}
                              <span>
                                <span className="block dd-type-control text-stone-800">{isAnnual ? "Annual" : "Monthly"}</span>
                                <span className="mt-1.5 block max-w-[9rem] text-xs leading-4 text-stone-600">
                                  {isAnnual
                                    ? "Save with one annual payment. Renews yearly until cancelled."
                                    : "Pay monthly. Renews each month until cancelled."}
                                </span>
                                <span className="mt-2 block text-[1.35rem] font-extrabold tracking-[-0.03em] text-ink-950">{product.displayPrice}</span>
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  {selectedProduct && (
                    <button
                      type="button"
                      onClick={() => void purchase(selectedProduct.id)}
                      disabled={busyProductId !== null}
                      aria-busy={busyProductId === selectedProduct.id}
                      aria-label={busyProductId === selectedProduct.id ? "Processing subscription" : "Subscribe now"}
                      className="dd-btn dd-btn-primary w-full cursor-pointer"
                    >
                      {busyProductId === selectedProduct.id ? (
                        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                      ) : "Subscribe now"}
                    </button>
                  )}
                </>
              ) : (
                <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
                  {error ?? "Subscription options are temporarily unavailable. Please try again later."}
                </p>
              )}
            </div>
          )}

          {user && isNativeAvailable && (
            <div className="pt-1 text-center">
              <p className="dd-type-meta text-stone-500">
                <Link href="/privacy" className="underline underline-offset-2 hover:text-stone-800">Privacy policy</Link>
                <span aria-hidden="true">{" · "}</span>
                <Link href="/terms" className="underline underline-offset-2 hover:text-stone-800">Terms of use</Link>
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
