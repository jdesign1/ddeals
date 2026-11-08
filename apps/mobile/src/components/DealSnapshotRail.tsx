"use client";

import { ArrowRight } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  compareDealSnapshotEntries,
  getDealSnapshotAmount,
  groupCategory,
  type CurrentDeal,
  type ProductCard,
  type DealSnapshotKind,
} from "@dodgey-deals/shared";
import ProductListCard from "@/components/ProductListCard";
import {
  createTop20Snapshot,
  getTop20DealKey,
  getTop20StorageKey,
  readTop20Snapshot,
  resolveTop20Snapshot,
  writeTop20Snapshot,
  type Top20Snapshot,
} from "@/lib/top20-freshness";

interface FlatDeal {
  product: ProductCard;
  deal: CurrentDeal;
}

const SNAPSHOT_RAIL_LIMIT = 20;

function compareRankedDeals(left: FlatDeal, right: FlatDeal, kind: DealSnapshotKind): number {
  return compareDealSnapshotEntries(left, right, kind) || left.product.name.localeCompare(right.product.name);
}

function buildRankedDeals(
  deals: readonly FlatDeal[],
  selectedCategorySet: ReadonlySet<string>,
  kind: DealSnapshotKind,
): FlatDeal[] {
  const ranked: FlatDeal[] = [];

  for (const candidate of deals) {
    if (
      selectedCategorySet.size > 0
      && !selectedCategorySet.has(groupCategory(candidate.product.category, candidate.product.name))
    ) {
      continue;
    }

    let insertAt = 0;
    while (insertAt < ranked.length && compareRankedDeals(candidate, ranked[insertAt]!, kind) >= 0) {
      insertAt += 1;
    }
    if (insertAt >= SNAPSHOT_RAIL_LIMIT) continue;

    ranked.splice(insertAt, 0, candidate);
    if (ranked.length > SNAPSHOT_RAIL_LIMIT) ranked.pop();
  }

  return ranked;
}

function arraysMatch(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function DealSnapshotRail({
  kind,
  deals,
  selectedCategories,
  refreshKey,
  showingNewOnly,
  updatedText,
  latestPublishedAt,
  onSeeAll,
  onSeeMore,
}: {
  kind: DealSnapshotKind;
  deals: FlatDeal[];
  selectedCategories: string[];
  refreshKey: string;
  showingNewOnly: boolean;
  updatedText: string | null;
  latestPublishedAt: string | null;
  onSeeAll: () => void;
  onSeeMore: () => void;
}) {
  const isSavings = kind === "savings";
  const title = isSavings ? "Top Savers" : "Dodgiest Deals";

  const selectedCategorySet = useMemo(() => new Set(selectedCategories), [selectedCategories]);
  const rankedDeals = useMemo(() => {
    return buildRankedDeals(deals, selectedCategorySet, kind);
  }, [deals, kind, selectedCategorySet]);

  const railRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const selectedCategoryKey = selectedCategories.join("|");
  const snapshotScopeKey = useMemo(() => {
    const stores = refreshKey.split(",").filter(Boolean).sort().join(",") || "all";
    const categories = [...selectedCategories].sort().join(",") || "all";
    return `${stores}:${categories}:${showingNewOnly ? "new" : "all"}`;
  }, [refreshKey, selectedCategories, showingNewOnly]);
  const snapshotStorageKey = useMemo(
    () => getTop20StorageKey(kind, snapshotScopeKey),
    [kind, snapshotScopeKey],
  );
  const snapshotDeals = useMemo(
    () => rankedDeals.filter(({ deal }) => getDealSnapshotAmount(deal, kind) != null),
    [kind, rankedDeals],
  );
  const hasRenderableDeals = snapshotDeals.length > 0;
  const currentSnapshot = useMemo(
    () => createTop20Snapshot(
      snapshotDeals.map(({ product, deal }) => ({ productId: product.id, store: deal.store })),
      latestPublishedAt,
    ),
    [latestPublishedAt, snapshotDeals],
  );
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [storedSnapshot, setStoredSnapshot] = useState<Top20Snapshot | null>(null);

  useEffect(() => {
    setLoadedStorageKey(snapshotStorageKey);
    setStoredSnapshot(readTop20Snapshot(snapshotStorageKey));
  }, [snapshotStorageKey]);

  const snapshotReady = loadedStorageKey === snapshotStorageKey;
  const resolvedSnapshot = useMemo(() => {
    if (!snapshotReady || !currentSnapshot) return null;
    return resolveTop20Snapshot(currentSnapshot, storedSnapshot);
  }, [currentSnapshot, snapshotReady, storedSnapshot]);

  useEffect(() => {
    if (!snapshotReady || !resolvedSnapshot) return;

    const isUnchanged = storedSnapshot
      && storedSnapshot.publishedAt === resolvedSnapshot.publishedAt
      && arraysMatch(storedSnapshot.keys, resolvedSnapshot.keys)
      && arraysMatch(storedSnapshot.newKeys, resolvedSnapshot.newKeys);
    if (isUnchanged) return;

    writeTop20Snapshot(snapshotStorageKey, resolvedSnapshot);
    setStoredSnapshot(resolvedSnapshot);
  }, [resolvedSnapshot, snapshotReady, snapshotStorageKey, storedSnapshot]);

  const newTop20Keys = useMemo(
    () => new Set(resolvedSnapshot?.newKeys ?? []),
    [resolvedSnapshot],
  );
  const sectionSubtext = showingNewOnly
    ? "New deals since your last visit."
    : isSavings
      ? "Best genuine specials available now."
      : "Most misleading specials available now.";
  const firstRenderableIndex = useMemo(
    () => rankedDeals.findIndex(({ deal }) => getDealSnapshotAmount(deal, kind) != null),
    [kind, rankedDeals],
  );
  const rankedCards = useMemo(
    () => rankedDeals.map(({ product, deal }, index) => {
      const amount = getDealSnapshotAmount(deal, kind);
      return {
        product,
        deal,
        index,
        amount,
        relatedStores: amount == null ? [] : alsoSpecialStores(product, deal.store),
        snapshot: amount == null
          ? undefined
          : {
              rank: index + 1,
              kind,
              amount,
              // Every card in the filtered rail has already passed the
              // New-to-you filter. Keep the existing Top 20 freshness badge
              // for the normal rail, and surface the same badge in filtered
              // mode so the card reinforces the active filter.
              isNew: showingNewOnly || newTop20Keys.has(getTop20DealKey(product.id, deal.store)),
            },
      };
    }),
    [kind, newTop20Keys, rankedDeals, showingNewOnly],
  );
  const isShortRail = rankedDeals.length < 10;

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
  }, [refreshKey, selectedCategoryKey, showingNewOnly]);

  if (!hasRenderableDeals) return null;

  return (
    <section className="flex flex-col gap-4 px-5 pb-4 pt-0" aria-labelledby={`${kind}-snapshot-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 id={`${kind}-snapshot-title`} className={`dd-type-section ${isSavings ? "text-fair-800" : "text-alert-700"}`}>
              {title}
            </h2>
            {updatedText && <span className="dd-type-meta dd-type-meta-strong text-stone-500">{updatedText}</span>}
          </div>
          <p className="dd-type-secondary mt-1 max-w-[18rem] text-stone-600" aria-live="polite">{sectionSubtext}</p>
        </div>
        <button
          type="button"
          onClick={isShortRail ? onSeeMore : onSeeAll}
          className="shrink-0 cursor-pointer dd-type-control text-stone-900 underline underline-offset-4 transition-colors hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-700"
        >
          {isShortRail ? "See more" : "See all"}
        </button>
      </div>

      <motion.div
        ref={railRef}
        className="hide-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-5 pb-2 pl-5 pr-0"
        role="region"
        aria-label={`${title} ranked products`}
        initial={false}
        animate={isRefreshing ? { opacity: [1, 0.72, 1] } : { opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {rankedCards.map(({ product, deal, amount, relatedStores, index, snapshot }) => {
          if (amount == null) return null;

          return (
            <ProductListCard
              key={`${kind}-${product.id}-${deal.store}`}
              product={product}
              deal={deal}
              imageLoading={index < 2 ? "eager" : "lazy"}
              storeLinePrefix={null}
              alsoSpecialStores={relatedStores}
              // The first rendered tile in each top specials belt is a
              // reliable bridge into the assessment walkthrough. The
              // savings belt renders first, with dodgy as a fallback.
              dataOnboarding={
                index === firstRenderableIndex
                  ? isSavings
                    ? "top-savings-deal-card"
                    : "dodgy-deal-card"
                  : undefined
              }
              snapshot={snapshot}
            />
          );
        })}
        {!isShortRail && <SnapshotSeeAllCard kind={kind} onSeeAll={onSeeAll} label="See all" />}
      </motion.div>
      <span className="sr-only" aria-live="polite">
        {isRefreshing ? `${title} updated` : ""}
      </span>
    </section>
  );
}

export default memo(DealSnapshotRail);

function SnapshotSeeAllCard({
  kind,
  onSeeAll,
  label,
}: {
  kind: DealSnapshotKind;
  onSeeAll: () => void;
  label: "See all" | "See more";
}) {
  const isSavings = kind === "savings";
  const beltTitle = isSavings ? "Top Savers" : "Dodgiest Deals";

  return (
    <button
      type="button"
      onClick={onSeeAll}
      aria-label={`${label} ${label === "See all" ? "in" : "from"} ${beltTitle.toLowerCase()}`}
      className="flex w-[40%] min-w-[136px] max-w-[180px] shrink-0 cursor-pointer snap-start self-stretch rounded-[1.5rem] p-4 text-stone-900 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-700"
    >
      <span className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
        <ArrowRight className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
        <span className="dd-type-control font-extrabold">{label}</span>
      </span>
    </button>
  );
}

function alsoSpecialStores(product: ProductCard, shownStore: string): string[] {
  const seen = new Set<string>();
  for (const deal of product.currentDeals) {
    if (deal.isOnSpecial !== false && deal.store !== shownStore) seen.add(deal.store);
  }
  return [...seen];
}
