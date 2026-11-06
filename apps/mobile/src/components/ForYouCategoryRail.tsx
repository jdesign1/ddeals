"use client";

import { Settings } from "lucide-react";
import { useMemo } from "react";
import { getDealSnapshotAmount } from "@dodgey-deals/shared";
import ProductListCard from "@/components/ProductListCard";
import type { CheckDealsRailItem } from "@/lib/check-deals-home";

export default function ForYouCategoryRail({
  categories,
  activeCategory,
  deals,
  onSelectCategory,
  onEditCategories,
  onSeeAll,
}: {
  categories: readonly string[];
  activeCategory: string;
  deals: readonly CheckDealsRailItem[];
  onSelectCategory: (category: string) => void;
  onEditCategories: () => void;
  onSeeAll: () => void;
}) {
  const cards = useMemo(
    () => deals.map((item, index) => {
      const amount = getDealSnapshotAmount(item.deal, "savings");
      return {
        item,
        index,
        amount,
        snapshot: {
          rank: index + 1,
          showRank: false,
          kind: "savings" as const,
          amount: amount ?? undefined,
          isNew: item.isNew,
          badgeLabel: amount == null ? "Special" : undefined,
          badgeTone: amount == null ? "neutral" as const : "savings" as const,
        },
      };
    }),
    [deals],
  );

  return (
    <section className="flex flex-col gap-3 bg-fair-50 px-5 py-5" aria-labelledby="for-you-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="for-you-title" className="dd-type-section text-fair-800">Your saved categories</h2>
          <p className="dd-type-secondary mt-1 max-w-[19rem] text-stone-600">Deals from your chosen categories</p>
        </div>
        <button
          type="button"
          onClick={onEditCategories}
          aria-label="Edit deal categories"
          aria-haspopup="dialog"
          title="Edit deal categories"
          className="-mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-start justify-center rounded-full pt-0.5 text-stone-900 transition-colors hover:bg-white/70 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
        >
          <Settings className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="hide-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 pt-1" role="tablist" aria-label="Your deal categories">
        {categories.map((category) => {
          const isActive = category === activeCategory;
          const tabId = `for-you-tab-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={isActive}
              aria-controls="for-you-deals"
              onClick={() => onSelectCategory(category)}
              className={`h-9 shrink-0 rounded-full px-3.5 py-2 dd-type-control transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-700 ${
                isActive
                  ? "bg-stone-900 text-white shadow-sm"
                  : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      {deals.length === 0 ? (
        <div id="for-you-deals" className="rounded-2xl border border-fair-100 bg-white px-4 py-5 text-center" role="tabpanel" aria-label={`${activeCategory} deals for you`}>
          <p className="dd-type-control text-stone-800">No current standout deals in {activeCategory}.</p>
          <p className="mt-1 dd-type-meta text-stone-500">Try another category above.</p>
        </div>
      ) : (
        <div id="for-you-deals" className="hide-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-5 pb-2 pl-5 pr-0" role="tabpanel" aria-label={`${activeCategory} deals for you`}>
          {cards.map(({ item, snapshot, index }) => {
            return (
              <ProductListCard
                key={`for-you-${activeCategory}-${item.product.id}-${item.deal.store}`}
                product={item.product}
                deal={item.deal}
                imageLoading={index < 2 ? "eager" : "lazy"}
                storeLinePrefix={null}
                snapshot={snapshot}
              />
            );
          })}
          <button
            type="button"
            onClick={onSeeAll}
            className="flex w-[40%] min-w-[136px] max-w-[180px] shrink-0 cursor-pointer snap-start self-stretch items-center justify-center rounded-[1.5rem] p-4 text-fair-800 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fair-700"
          >
            <span className="dd-type-control font-extrabold">See all</span>
          </button>
        </div>
      )}
    </section>
  );
}
