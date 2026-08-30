"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePageHeader } from "@/lib/header-context";
import PageLoader from "@/components/PageLoader";
import { BalanceFilledIcon, WarningFilledIcon, WorkspacePremiumFilledIcon } from "@/components/icons/MaterialSymbols";

/**
 * "How Dodgy Deal works" -- ported from Prototype/index.html's
 * `HowItWorksTab` (2026-08-12, per Jay's ask to add the prototype's profile
 * menu items to the app; see `AppHeader.tsx`'s own doc comment for the full
 * menu-items decision). Reached from the profile menu, available whether
 * signed in or out (no auth gate) -- matches the prototype's own menu,
 * where this was always the first item regardless of login state.
 *
 * A real route with its own header override (`usePageHeader`, back
 * button), same pattern the deal-assessment page already established, not
 * a modal the way the prototype renders it (this app has a real router;
 * every other screen here is already a real route too).
 *
 * Deliberate content change from the prototype, flagged rather than
 * silently ported: the prototype's third "how to use" step ("Get deal
 * warnings... receive proactive warnings when tracked list products have
 * their prices changed") describes a push-alert feature that doesn't exist
 * in apps/mobile -- there's no notifications/alerts system here, only the
 * real deal-assessment page (tap a product -> see its verdict). Rather
 * than promise a feature this app doesn't have, that step was swapped for
 * "Check any deal," describing what tapping a product card actually does.
 * Everything else (the rating-system definitions, the verdict copy) is
 * ported near-verbatim -- it's genuinely accurate to how this app's own
 * `getAssessmentVerdict` (packages/shared/src/deal-detail.ts) works.
 *
 * App-wide sentence-case sweep (2026-08-13, per Jay's "scan the app to
 * ensure there are no capitals only texts, app should use sentence case"):
 * dropped `uppercase` from the hero eyebrow, `<h1>`, both section
 * headings, the rating-card tag chip, and each numbered step's title, and
 * sentence-cased the source strings that needed it ("Empowering Shoppers"
 * -> "Empowering shoppers", the `<h1>`/page-header title "How Dodgy Deal
 * Works" -> "How Dodgy Deal works", "Our Deal Rating System" -> "Our deal
 * rating system", "How To Use Dodgy Deal" -> "How to use Dodgy Deal",
 * "Best Buy" tag -> "Best buy"). Left the 3 `RatingCard` `label` values
 * ("Dodgy Deal", "Fair Deal", "Real Saver") in Title Case on purpose --
 * these are the app's actual verdict category names (same 3 terms
 * `getAssessmentVerdict` produces and every other verdict badge/heading in
 * the app already renders), not ordinary phrase text, so they get the same
 * proper-noun treatment as "Dodgy Deal" elsewhere rather than becoming
 * "Dodgy deal"/"Fair deal"/"Real saver" here only.
 *
 * The hero `<h1>` referenced just above (once "How Dodgy Deal works") is
 * gone entirely as of the very next request the same day -- Jay: "remove
 * the h1 titles from each page, as we have the title in the top nav bar."
 * It duplicated this page's own `usePageHeader("How Dodgy Deal works", ...)`
 * title one line down the screen, so it came out; the eyebrow badge and
 * description paragraph that used to sit above/below it are unchanged.
 */
export default function HowItWorksPage() {
  const router = useRouter();
  const [pageReady, setPageReady] = useState(false);
  usePageHeader("How Dodgy Deal works", () => router.back());

  // Let the browser paint the route once before revealing it. The mascot cover
  // stays up for those first two frames, then fades away through PageLoader so
  // the content appears smoothly instead of flashing in underneath the header.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPageReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <>
      <PageLoader loading={!pageReady} />
      <main
        aria-busy={!pageReady}
        className={`flex flex-col gap-6 px-5 py-6 pb-10 transition-opacity duration-300 ease-out ${
          pageReady ? "opacity-100" : "opacity-0"
        }`}
      >
      <div className="space-y-2">
        <div className="-mx-2 -mt-2 mb-1 flex justify-center">
          <Image
            src="/empowering-shoppers.png"
            alt="Dodgy Deal mascot holding a verified price card beside a grocery basket"
            width={720}
            height={768}
            preload
            className="mascot-wave h-auto w-full max-w-[9rem]"
          />
        </div>
        <h2 className="text-center font-display text-lg font-black tracking-normal text-stone-900">Empowering shoppers</h2>
        <p className="text-center text-sm font-medium leading-relaxed text-stone-600">
          Supermarket specials aren&rsquo;t always what they seem. We track real price history across NZ supermarkets
          to help you spot genuine bargains and avoid fake sales.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-center font-display text-base leading-5 font-black tracking-wide text-stone-900">Our deal rating system</h2>
        <div className="flex flex-col gap-3">
          <RatingCard
            icon={<WarningFilledIcon className="text-[28px]" />}
            iconBg="text-alert-600"
            label="Dodgy Deal"
            labelClassName="text-alert-700"
            tag="Dodgy"
            tagClassName="bg-alert-600 text-white"
            description={'An item marked as a "special" that has no real discount, is priced higher than its recent history, or was quietly marked up right before the sale started.'}
          />
          <RatingCard
            icon={<BalanceFilledIcon className="text-[28px]" />}
            iconBg="text-dodgy-500"
            label="Fair Deal"
            labelClassName="text-dodgy-700"
            tag="Fair"
            tagClassName="bg-dodgy-600 text-white"
            description="A genuine but minor price drop, matching typical promotional frequency. Safe to buy, but not a historic low."
          />
          <RatingCard
            icon={<WorkspacePremiumFilledIcon className="text-[28px]" />}
            iconBg="text-fair-600"
            label="Real Saver"
            labelClassName="text-fair-700"
            tag="Real"
            tagClassName="bg-fair-600 text-white"
            description="A deep, authentic discount well below the recent average price. A genuinely outstanding deal."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-center font-display text-base leading-5 font-black tracking-wide text-stone-900">How to use Dodgy Deal</h2>
        <div className="flex flex-col gap-3">
          <Step number={1} title="Search grocery products">
            Type in a brand or item (like &ldquo;coffee&rdquo; or &ldquo;butter&rdquo;) to see current specials
            across different NZ supermarkets.
          </Step>
          <Step number={2} title="Add items to your list">
            Save products you buy regularly to your own list, so you can check back on them any time.
          </Step>
          <Step number={3} title="Check any deal">
            Tap a product to see its real verdict &mdash; Dodgy Deal, Fair Deal, or Real Saver &mdash; based on its
            actual recent price history.
          </Step>
        </div>
      </section>
      </main>
    </>
  );
}

function RatingCard({
  icon,
  iconBg,
  label,
  labelClassName,
  tag,
  tagClassName,
  description,
}: {
  icon: ReactNode;
  iconBg: string;
  label: string;
  labelClassName: string;
  tag: string;
  tagClassName: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl bg-white p-4.5 shadow-sm">
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center ${iconBg}`}>{icon}</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={`font-display text-[13px] leading-4 font-black tracking-wider ${labelClassName}`}>{label}</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${tagClassName}`}>{tag}</span>
        </div>
        <p className="text-[13px] font-semibold leading-relaxed text-stone-600">{description}</p>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-600 text-[13px] leading-4 font-black text-white">
        {number}
      </span>
      <div className="space-y-1">
        <h3 className="text-[13px] leading-4 font-black tracking-wider text-stone-900">{title}</h3>
        <p className="text-[13px] font-semibold leading-relaxed text-stone-600">{children}</p>
      </div>
    </div>
  );
}
