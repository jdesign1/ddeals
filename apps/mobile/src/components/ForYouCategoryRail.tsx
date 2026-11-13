"use client";

import { Settings } from "lucide-react";
import Image from "next/image";
import { memo, useMemo } from "react";
import { getDealSnapshotAmount, type DealSnapshotKind } from "@dodgey-deals/shared";
import ProductListCard from "@/components/ProductListCard";
import { getCategoryImageSrc } from "@/lib/category-images";
import type { CheckDealsRailItem } from "@/lib/check-deals-home";

function ForYouCategoryRail({
  categories,
  activeCategory,
  deals,
  counts,
  dealType,
  onSelectCategory,
  onSelectDealType,
  onEditCategories,
  onSeeAll,
}: {
  categories: readonly string[];
  activeCategory: string;
  deals: readonly CheckDealsRailItem[];
  counts: ReadonlyMap<string, number>;
  dealType: DealSnapshotKind;
  onSelectCategory: (category: string) => void;
  onSelectDealType: (dealType: DealSnapshotKind) => void;
  onEditCategories: () => void;
  onSeeAll: () => void;
}) {
  const isDodgy = dealType === "dodgy";
  const dealLabel = isDodgy ? "Dodgy Deals" : "Real Savers";
  const cards = useMemo(
    () => deals.map((item, index) => {
      const amount = getDealSnapshotAmount(item.deal, dealType);
      return {
        item,
        index,
        snapshot: {
          rank: index + 1,
          showRank: false,
          kind: dealType,
          amount: amount ?? undefined,
          isNew: item.isNew,
          badgeLabel: amount == null ? "Special" : undefined,
          badgeTone: amount == null ? "neutral" as const : isDodgy ? "dodgy" as const : "savings" as const,
        },
      };
    }),
    [dealType, deals, isDodgy],
  );

  return (
    <section className="flex flex-col gap-3 bg-fair-50 px-5 py-5" aria-labelledby="for-you-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="for-you-title" className="dd-type-section text-fair-800">Your saved categories</h2>
          <p className="dd-type-secondary mt-1 max-w-[19rem] text-stone-600">Best specials from your favourite categories</p>
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

      <div className="grid grid-cols-2 rounded-2xl bg-white p-1 shadow-xs ring-1 ring-stone-200" role="group" aria-label="Deal type">
        {(["savings", "dodgy"] as const).map((kind) => {
          const selected = dealType === kind;
          const label = kind === "savings" ? "Real Savers" : "Dodgy Deals";
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectDealType(kind)}
              className={`min-h-10 rounded-xl px-3 dd-type-control font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 ${
                selected ? "bg-stone-900 text-white shadow-sm" : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="hide-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 pt-1" role="tablist" aria-label={`${dealLabel} by saved category`}>
        {categories.map((category) => {
          const isActive = category === activeCategory;
          const count = counts.get(category) ?? 0;
          const countLabel = isDodgy
            ? `${count} ${count === 1 ? "Dodgy Deal" : "Dodgy Deals"}`
            : `${count} ${count === 1 ? "Real Saver" : "Real Savers"}`;
          const tabId = `for-you-category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={isActive}
              aria-controls="for-you-category-deals"
              aria-label={`${countLabel} in ${category}`}
              onClick={() => onSelectCategory(category)}
              className={`flex w-[6.25rem] shrink-0 cursor-pointer flex-col items-center rounded-2xl border px-2 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 ${
                isActive ? "border-stone-900 bg-white shadow-sm" : "border-stone-200 bg-white/70 hover:bg-white"
              }`}
            >
              <span className="dd-type-section leading-none tabular-nums text-stone-900">{count}</span>
              <Image
                src={getCategoryImageSrc(category)}
                alt=""
                width={48}
                height={48}
                className="my-1 h-12 w-12 object-contain"
                aria-hidden="true"
              />
              <span className="dd-type-meta line-clamp-2 min-h-8 leading-4 text-stone-700">{category}</span>
            </button>
          );
        })}
      </div>

      {deals.length === 0 ? (
        <div id="for-you-category-deals" className="rounded-2xl border border-fair-100 bg-white px-4 py-5 text-center" role="tabpanel" aria-label={`${activeCategory} ${dealLabel}`}>
          <p className="dd-type-control text-stone-800">No current {dealLabel.toLowerCase()} in {activeCategory}.</p>
          <p className="mt-1 dd-type-meta text-stone-500">Try another category above.</p>
        </div>
      ) : (
        <div id="for-you-category-deals" className="hide-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-5 pb-2 pl-5 pr-0" role="tabpanel" aria-label={`${activeCategory} ${dealLabel}`}>
          {cards.map(({ item, snapshot, index }) => (
            <ProductListCard
              key={`for-you-${dealType}-${activeCategory}-${item.product.id}-${item.deal.store}`}
              product={item.product}
              deal={item.deal}
              imageLoading={index < 2 ? "eager" : "lazy"}
              storeLinePrefix={null}
              snapshot={snapshot}
            />
          ))}
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

export default memo(ForYouCategoryRail);
