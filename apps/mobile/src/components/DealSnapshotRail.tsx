"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  compareDealSnapshotEntries,
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
  isAllStoresSelected,
  refreshKey,
}: {
  kind: DealSnapshotKind;
  deals: FlatDeal[];
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  availableCategories: string[];
  categoryCounts: Map<string, number>;
  isAllStoresSelected: boolean;
  refreshKey: string;
}) {
  const isSavings = kind === "savings";
  const title = isSavings ? "Top Savings Specials" : "Dodgiest Specials";
  const description = isSavings ? "Biggest savings" : "Biggest price hikes";
  const emptyMessage = isSavings
    ? "No verified savings match this category yet."
    : "No inflated-price Dodgy specials match this category yet.";

  const rankedDeals = useMemo(() => {
    const filtered = selectedCategories.length === 0
      ? deals
      : deals.filter(({ product }) => selectedCategories.includes(groupCategory(product.category, product.name)));

    return [...filtered]
      .sort((a, b) => compareDealSnapshotEntries(a, b, kind) || a.product.name.localeCompare(b.product.name))
      .slice(0, 20);
  }, [deals, kind, selectedCategories]);

  const railRef = useRef<HTMLDivElement>(null);
  const [snapshotCardHeight, setSnapshotCardHeight] = useState<number | null>(null);
  const hasMountedRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const selectedCategoryKey = selectedCategories.join("|");
  const firstRenderableIndex = useMemo(
    () => rankedDeals.findIndex(({ deal }) => getDealSnapshotAmount(deal, kind) != null),
    [kind, rankedDeals],
  );

  // The initial All-supermarkets result establishes the compact belt height.
  // Keeping that measured height when a single supermarket is selected stops
  // a different product mix from making the whole belt jump vertically.
  useLayoutEffect(() => {
    if (!isAllStoresSelected || snapshotCardHeight !== null || rankedDeals.length === 0) return;
    const firstCard = railRef.current?.querySelector<HTMLElement>("[data-snapshot-card]");
    if (!firstCard) return;
    const measuredHeight = Math.ceil(firstCard.getBoundingClientRect().height);
    if (measuredHeight > 0) setSnapshotCardHeight(measuredHeight);
  }, [isAllStoresSelected, rankedDeals.length, snapshotCardHeight]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (railRef.current) railRef.current.scrollLeft = 0;
    setIsRefreshing(true);
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => setIsRefreshing(false), 500);

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [refreshKey, selectedCategoryKey]);

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
          withoutShadow
          singleCategoryLabel="1 category"
        />
      </div>

      {rankedDeals.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-6 text-center shadow-sm">
          <p className="dd-type-secondary text-stone-600">{emptyMessage}</p>
        </div>
      ) : (
        <motion.div
          ref={railRef}
          className="hide-scrollbar -mx-5 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-5 pb-2 pl-5 pr-0"
          role="region"
          aria-label={`${title} ranked products`}
          initial={false}
          animate={isRefreshing ? { opacity: [1, 0.72, 1] } : { opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
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
                // The first rendered tile in each top specials belt is a
                // reliable bridge into the assessment walkthrough. The
                // savings belt renders first, with dodgy as a fallback.
                dataOnboarding={index === firstRenderableIndex ? "deal-card" : undefined}
                snapshotCardHeight={snapshotCardHeight ?? undefined}
                snapshot={{
                  rank: index + 1,
                  kind,
                  amount,
                }}
              />
            );
          })}
        </motion.div>
      )}
      <span className="sr-only" aria-live="polite">
        {isRefreshing ? `${title} updated` : ""}
      </span>
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
