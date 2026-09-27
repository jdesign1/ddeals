"use client";

import { useMemo } from "react";
import {
  compareDealSnapshotEntries,
  getDealConfidenceLabel,
  getDealSnapshotAmount,
  groupCategory,
  type CurrentDeal,
  type ProductCard,
  type DealSnapshotKind,
} from "@dodgey-deals/shared";
import CategoryPicker from "@/components/CategoryPicker";
import ProductListCard from "@/components/ProductListCard";

interface FlatDeal {
  product: ProductCard;
  deal: CurrentDeal;
}

export default function DealSnapshotRail({
  kind,
  deals,
  selectedCategories,
  onCategoriesChange,
  availableCategories,
  categoryCounts,
}: {
  kind: DealSnapshotKind;
  deals: FlatDeal[];
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  availableCategories: string[];
  categoryCounts: Map<string, number>;
}) {
  const isSavings = kind === "savings";
  const title = isSavings ? "Top Savings Specials" : "Worst Dodgy Specials";
  const description = isSavings
    ? "The biggest verified dollar savings right now."
    : "The largest inflated price gaps found in current specials.";
  const emptyMessage = isSavings
    ? "No verified savings match this category yet."
    : "No inflated-price Dodgy specials match this category yet.";

  const rankedDeals = useMemo(() => {
    const filtered = selectedCategories.length === 0
      ? deals
      : deals.filter(({ product }) => selectedCategories.includes(groupCategory(product.category)));

    return [...filtered]
      .sort((a, b) => compareDealSnapshotEntries(a, b, kind) || a.product.name.localeCompare(b.product.name))
      .slice(0, 20);
  }, [deals, kind, selectedCategories]);

  return (
    <section className={`flex flex-col gap-3 px-5 py-5 ${isSavings ? "bg-fair-50" : "bg-alert-50"}`} aria-labelledby={`${kind}-snapshot-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${kind}-snapshot-title`} className={`dd-type-section ${isSavings ? "text-fair-800" : "text-alert-700"}`}>
            {title}
          </h2>
          <p className="dd-type-secondary mt-1 max-w-[18rem] text-stone-600">{description}</p>
        </div>
        <CategoryPicker
          label="Category"
          ariaLabel={`Filter ${title.toLowerCase()} by category`}
          selectedCategories={selectedCategories}
          onChange={onCategoriesChange}
          availableCategories={availableCategories}
          categoryCounts={categoryCounts}
          emptyMessage={emptyMessage}
        />
      </div>

      {rankedDeals.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-6 text-center shadow-sm">
          <p className="dd-type-secondary text-stone-600">{emptyMessage}</p>
        </div>
      ) : (
        <div
          className="hide-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2"
          role="region"
          aria-label={`${title} ranked products`}
        >
          {rankedDeals.map(({ product, deal }, index) => {
            const amount = getDealSnapshotAmount(deal, kind);
            if (amount == null) return null;

            return (
              <ProductListCard
                key={`${kind}-${product.id}-${deal.store}`}
                product={product}
                deal={deal}
                imageLoading={index < 2 ? "eager" : "lazy"}
                storeLinePrefix={null}
                alsoSpecialStores={alsoSpecialStores(product, deal.store)}
                snapshot={{
                  rank: index + 1,
                  kind,
                  amount,
                  confidenceLabel: getDealConfidenceLabel(deal),
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function alsoSpecialStores(product: ProductCard, shownStore: string): string[] {
  const seen = new Set<string>();
  for (const deal of product.currentDeals) {
    if (deal.isOnSpecial !== false && deal.store !== shownStore) seen.add(deal.store);
  }
  return [...seen];
}
