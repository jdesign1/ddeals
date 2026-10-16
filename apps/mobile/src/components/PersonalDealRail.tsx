"use client";

import { ArrowRight } from "lucide-react";
import { useMemo, useRef } from "react";
import { getDealSnapshotAmount, type DealSnapshotKind } from "@dodgey-deals/shared";
import ProductListCard from "@/components/ProductListCard";
import type { CheckDealsRailItem } from "@/lib/check-deals-home";

type PersonalRailTone = "new" | "watchlist" | "history";

const toneStyles: Record<PersonalRailTone, { section: string; title: string; action: string }> = {
  new: { section: "bg-ink-50", title: "text-ink-700", action: "text-ink-700 hover:text-ink-950" },
  watchlist: { section: "bg-fair-50", title: "text-fair-800", action: "text-fair-800 hover:text-fair-950" },
  history: { section: "bg-stone-50", title: "text-stone-900", action: "text-stone-700 hover:text-stone-950" },
};

function snapshotKindForDeal(item: CheckDealsRailItem): DealSnapshotKind {
  return item.deal.dealType === "Dodgy Deal" ? "dodgy" : "savings";
}

export default function PersonalDealRail({
  id,
  title,
  description,
  deals,
  emptyMessage,
  tone,
  onSeeAll,
}: {
  id: string;
  title: string;
  description: string;
  deals: CheckDealsRailItem[];
  emptyMessage: string;
  tone: PersonalRailTone;
  onSeeAll?: () => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const visibleDeals = useMemo(() => deals.slice(0, 20), [deals]);
  const styles = toneStyles[tone];

  return (
    <section className={`flex flex-col gap-3 px-5 py-5 ${styles.section}`} aria-labelledby={`${id}-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className={`dd-type-section ${styles.title}`}>{title}</h2>
          <p className="dd-type-secondary mt-1 max-w-[18rem] text-stone-600">{description}</p>
        </div>
        {onSeeAll && visibleDeals.length > 0 && (
          <button
            type="button"
            onClick={onSeeAll}
            className={`shrink-0 cursor-pointer dd-type-control underline underline-offset-4 transition-colors ${styles.action}`}
          >
            See all
          </button>
        )}
      </div>

      {visibleDeals.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-6 text-center shadow-sm">
          <p className="dd-type-secondary text-stone-600">{emptyMessage}</p>
        </div>
      ) : (
        <div
          ref={railRef}
          className="hide-scrollbar -mx-5 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-5 pb-2 pl-5 pr-0"
          role="region"
          aria-label={`${title} products`}
        >
          {visibleDeals.map((item, index) => {
            const kind = snapshotKindForDeal(item);
            const amount = getDealSnapshotAmount(item.deal, kind);
            return (
              <ProductListCard
                key={`${id}-${item.product.id}-${item.deal.store}`}
                product={item.product}
                deal={item.deal}
                imageLoading={index < 2 ? "eager" : "lazy"}
                storeLinePrefix={null}
                snapshot={{
                  rank: index + 1,
                  kind,
                  amount: amount ?? undefined,
                  badgeLabel: amount == null ? "Special" : undefined,
                  badgeTone: amount == null ? "neutral" : kind,
                  isNew: item.isNew,
                }}
              />
            );
          })}
          {onSeeAll && visibleDeals.length >= 10 && (
            <button
              type="button"
              onClick={onSeeAll}
              className={`flex w-[40%] min-w-[136px] max-w-[180px] shrink-0 cursor-pointer snap-start self-stretch rounded-[1.5rem] p-4 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 ${styles.action}`}
              aria-label={`See all ${title.toLowerCase()}`}
            >
              <span className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
                <ArrowRight className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
                <span className="dd-type-control font-extrabold">See all</span>
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
