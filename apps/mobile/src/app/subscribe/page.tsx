"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Check,
  ExternalLink,
  HeartHandshake,
  ListPlus,
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
    label: "Unlimited Watchlist items",
    detail: "Keep every product you want to watch in one place.",
    icon: ListPlus,
  },
  {
    label: "Full All Checks access",
    detail: "See your complete deal-check history, not just the latest few.",
    icon: ScanSearch,
  },
  {
    label: "Full deal stats and insights",
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

  usePageHeader("Subscribe", () => router.back());

  if (authLoading) {
    return <main className="flex min-h-full items-center justify-center px-5 py-10" aria-busy="true" />;
  }

  const accessUntil = formatSubscriptionDate(currentSubscription?.expires_at);
  const showPurchaseOptions = Boolean(user && !isPremium && isNativeAvailable);
  const purchaseOptionsLoading = subscriptionLoading || productsLoading;

  return (
    <main className="flex flex-col gap-4 bg-fair-50/70 px-5 py-5 pb-safe-nav">
      <section className="relative flex flex-col gap-5 overflow-hidden rounded-[2rem] border border-fair-100 bg-white px-5 pb-6 pt-4 shadow-sm" aria-labelledby="subscribe-page-title">
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-fair-100/60" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 bottom-10 h-32 w-32 rounded-full bg-fair-50" aria-hidden="true" />
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
          <h1 id="subscribe-page-title" className="mx-auto mt-3 max-w-[18rem] dd-type-page-title text-stone-900">
            {isPremium ? "Your subscription is active" : "More savings. Less guesswork."}
          </h1>
          <p className="mx-auto mt-2 max-w-[20rem] dd-type-body text-stone-600">
            {isPremium
              ? "Your subscription keeps your Watchlist unlimited and your price alerts active."
              : "Unlock the full Dodgy Deal picture across your Watchlist, deal history and savings insights."}
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
                  <span className="flex items-center gap-1.5 dd-type-control text-stone-800">
                    <Check className="h-3.5 w-3.5 shrink-0 text-fair-700" aria-hidden="true" />
                    {benefit.label}
                  </span>
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
            <div className="flex flex-col gap-3">
              {purchaseOptionsLoading ? (
                <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600" aria-busy="true">Loading subscription options…</p>
              ) : products.length > 0 ? (
                <div className={products.length > 1 ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
                  {products.map((product) => {
                    const isAnnual = product.id === SUBSCRIPTION_PRODUCT_IDS.annual;
                    const isBusy = busyProductId === product.id;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => void purchase(product.id)}
                        disabled={busyProductId !== null}
                        aria-label={["Subscribe to the", isAnnual ? "annual" : "monthly", "plan for", product.displayPrice].join(" ")}
                        className={[
                          "relative flex min-h-[10.5rem] flex-col items-start justify-between rounded-2xl border px-3.5 py-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 disabled:cursor-wait disabled:opacity-60",
                          isAnnual ? "border-fair-300 bg-fair-50 hover:border-fair-400" : "border-stone-200 bg-white hover:border-ink-300 hover:bg-stone-50",
                        ].join(" ")}
                      >
                        <span>
                          <span className="block dd-type-control text-stone-800">{isAnnual ? "Annual" : "Monthly"}</span>
                          <span className="mt-2 block text-[1.35rem] font-extrabold tracking-[-0.03em] text-ink-950">{isBusy ? "Starting…" : product.displayPrice}</span>
                        </span>
                        <span className="block dd-type-meta text-stone-600">{product.description || (isAnnual ? "Renews yearly" : "Renews monthly")}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
                  {error ?? "Subscription options are temporarily unavailable. Please try again later."}
                </p>
              )}
            </div>
          )}

          {error && products.length > 0 && <p role="status" className="text-sm leading-5 text-alert-700">{error}</p>}
          {user && isNativeAvailable && (
            <div className="border-t border-stone-100 pt-3 text-center">
              <p className="dd-type-meta text-stone-500">Plans renew automatically until cancelled in Settings.</p>
              <p className="mt-1 dd-type-meta text-stone-500">
                <Link href="/privacy" className="underline underline-offset-2 hover:text-stone-800">Privacy</Link>
                <span aria-hidden="true">{" · "}</span>
                <Link href="/terms" className="underline underline-offset-2 hover:text-stone-800">Terms</Link>
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
