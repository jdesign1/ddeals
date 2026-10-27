"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePageHeader } from "@/lib/header-context";

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
 * "Best Buy" tag -> "Best buy"). Left the 3 rating badge labels
 * ("Dodgy Deal", "Fair Price", "Real Saver") in the rating badges in Title Case on purpose --
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
 * title one line down the screen, so it came out; the explanatory content
 * remains below the hero image and now follows the Settings page's cleaner
 * bordered sections and inset-row pattern.
 */
export default function HowItWorksPage() {
  const router = useRouter();
  const [pageReady, setPageReady] = useState(false);
  usePageHeader("How Dodgy Deal works", () => router.back());

  // Let the browser paint the route once before revealing it, so the content
  // appears smoothly instead of flashing in underneath the header.
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
      <main
        aria-busy={!pageReady}
        className={`page-paper-surface min-h-full flex flex-col gap-4 px-5 py-6 pb-10 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          pageReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <h1 className="sr-only">How Dodgy Deal works</h1>
        <div className="-mx-5 -mt-6 flex justify-center">
          <Image
            src="/how-it-works-dodgy-deal.webp"
            alt="Dodgy Deal mascot spotting a dodgy supermarket deal on his phone beside a shopping basket"
            width={840}
            height={840}
            sizes="100vw"
            preload
            unoptimized
            className="how-it-works-mascot h-auto w-full max-w-none"
          />
        </div>

        <InfoSection id="how-it-works-intro-title" title="Empowering shoppers">
          <p className="dd-type-body text-stone-600">
            Supermarket specials aren&rsquo;t always what they seem. We track real price history across NZ supermarkets
            to help you spot genuine bargains and avoid fake sales.
          </p>
        </InfoSection>

        <InfoSection id="how-it-works-ratings-title" title="Our deal rating system">
          <ul className="overflow-hidden rounded-2xl border border-stone-200/80">
            <RatingCard
              tag="Dodgy Deal"
              tagClassName="dd-badge-alert"
              description={'An item marked as a "special" that has no real discount, is priced higher than its recent history, or was quietly marked up right before the sale started.'}
            />
            <RatingCard
              tag="Fair Price"
              tagClassName="dd-badge-dodgy"
              description="A genuine but minor price drop, matching typical promotional frequency. Safe to buy, but not a historic low."
            />
            <RatingCard
              tag="Real Saver"
              tagClassName="dd-badge-fair"
              description="A deep, authentic discount well below the recent average price. A genuinely outstanding deal."
            />
          </ul>
        </InfoSection>

        <InfoSection id="how-it-works-steps-title" title="How to use Dodgy Deal">
          <ol className="overflow-hidden rounded-2xl border border-stone-200/80">
            <Step title="Search grocery products">
              Type in a brand or item (like &ldquo;coffee&rdquo; or &ldquo;butter&rdquo;) to see current specials
              across different NZ supermarkets.
            </Step>
            <Step title="Add items to your list">
              Save products you buy regularly to your own list, so you can check back on them any time.
            </Step>
            <Step title="Check any deal">
              Tap a product to see its real verdict &mdash; Dodgy Deal, Fair Price, or Real Saver &mdash; based on its
              actual recent price history.
            </Step>
          </ol>
        </InfoSection>

        <Link href="/" className="dd-btn dd-btn-primary w-full cursor-pointer text-center font-display">
          Search for deals
        </Link>
      </main>
    </>
  );
}

function RatingCard({
  tag,
  tagClassName,
  description,
}: {
  tag: string;
  tagClassName: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-stone-100 bg-stone-50 p-4 last:border-b-0">
      <div className="min-w-0 space-y-2">
        <span className={`dd-badge ${tagClassName}`}>{tag}</span>
        <p className="dd-type-secondary text-stone-600">{description}</p>
      </div>
    </li>
  );
}

function InfoSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-stone-200/80 bg-white p-4" aria-labelledby={id}>
      <div className="px-1">
        <h2 id={id} className="dd-type-section text-stone-900">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Step({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="border-b border-stone-100 bg-stone-50 p-4 last:border-b-0">
      <h3 className="dd-type-control text-stone-900">{title}</h3>
      <p className="mt-1 dd-type-secondary text-stone-600">{children}</p>
    </li>
  );
}
