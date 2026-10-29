"use client";

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
  return (
    <section className="flex flex-col gap-3 bg-fair-50 px-5 py-5" aria-labelledby="for-you-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="for-you-title" className="dd-type-section text-fair-800">For you</h2>
          <p className="dd-type-secondary mt-1 max-w-[19rem] text-stone-600">Best current specials in the categories you follow.</p>
        </div>
        <button
          type="button"
          onClick={onEditCategories}
          className="shrink-0 cursor-pointer dd-type-control text-fair-800 underline underline-offset-4 transition-colors hover:text-fair-950"
        >
          Edit
        </button>
      </div>

      <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Your deal categories">
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
              className={`min-h-10 shrink-0 rounded-full px-3.5 py-2 dd-type-control transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fair-700 ${
                isActive
                  ? "bg-fair-700 text-white shadow-sm"
                  : "bg-white text-stone-700 ring-1 ring-fair-200 hover:bg-fair-100"
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
          {deals.map((item, index) => {
            const amount = getDealSnapshotAmount(item.deal, "savings");
            return (
              <ProductListCard
                key={`for-you-${activeCategory}-${item.product.id}-${item.deal.store}`}
                product={item.product}
                deal={item.deal}
                imageLoading={index < 2 ? "eager" : "lazy"}
                storeLinePrefix={null}
                snapshot={{
                  rank: index + 1,
                  showRank: false,
                  kind: "savings",
                  amount: amount ?? undefined,
                  isNew: item.isNew,
                  badgeLabel: amount == null ? "Special" : undefined,
                  badgeTone: amount == null ? "neutral" : "savings",
                }}
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
