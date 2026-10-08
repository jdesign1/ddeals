"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

function getLatestPublishedAt(deals: readonly FlatDeal[]): string | null {
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  let latestPublishedAt: string | null = null;

  for (const { deal } of deals) {
    for (const candidate of [deal.scrapedAt, deal.specialsVerifiedAt]) {
      const timestamp = Date.parse(candidate ?? "");
      if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestPublishedAt = new Date(timestamp).toISOString();
      }
    }
  }

  return latestPublishedAt;
}

function formatUpdatedText(publishedAt: string | null): string | null {
  if (!publishedAt) return null;

  const ageMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(publishedAt)) / 60_000));
  if (ageMinutes < 1) return "Updated just now";
  if (ageMinutes < 60) return `Updated ${ageMinutes} min ago`;

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `Updated ${ageHours} ${ageHours === 1 ? "hour" : "hours"} ago`;

  const ageDays = Math.floor(ageHours / 24);
  return `Updated ${ageDays} ${ageDays === 1 ? "day" : "days"} ago`;
}

function arraysMatch(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export default function DealSnapshotRail({
  kind,
  deals,
  selectedCategories,
  refreshKey,
  onSeeAll,
  onSeeMore,
}: {
  kind: DealSnapshotKind;
  deals: FlatDeal[];
  selectedCategories: string[];
  refreshKey: string;
  onSeeAll: () => void;
  onSeeMore: () => void;
}) {
  const isSavings = kind === "savings";
  const title = isSavings ? "Top Savings Specials" : "Dodgiest Specials";
  const emptyMessage = isSavings
    ? "No real specials in this category right now, check again later"
    : "No dodgy specials in this category right now, check again later";

  const rankedDeals = useMemo(() => {
    const filtered = selectedCategories.length === 0
      ? deals
      : deals.filter(({ product }) => selectedCategories.includes(groupCategory(product.category, product.name)));

    return [...filtered]
      .sort((a, b) => compareDealSnapshotEntries(a, b, kind) || a.product.name.localeCompare(b.product.name))
      .slice(0, 20);
  }, [deals, kind, selectedCategories]);

  const railRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const selectedCategoryKey = selectedCategories.join("|");
  const snapshotScopeKey = useMemo(() => {
    const stores = refreshKey.split(",").filter(Boolean).sort().join(",") || "all";
    const categories = [...selectedCategories].sort().join(",") || "all";
    return `${stores}:${categories}`;
  }, [refreshKey, selectedCategories]);
  const snapshotStorageKey = useMemo(
    () => getTop20StorageKey(kind, snapshotScopeKey),
    [kind, snapshotScopeKey],
  );
  const latestPublishedAt = useMemo(() => getLatestPublishedAt(deals), [deals]);
  const snapshotDeals = useMemo(
    () => rankedDeals.filter(({ deal }) => getDealSnapshotAmount(deal, kind) != null),
    [kind, rankedDeals],
  );
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
  const freshnessText = formatUpdatedText(latestPublishedAt);
  const fallbackDescription = isSavings ? "Biggest savings" : "Biggest price hikes";
  const sectionSubtext = freshnessText
    ? `${freshnessText}${newTop20Keys.size > 0 ? ` · ${newTop20Keys.size} new deal${newTop20Keys.size === 1 ? "" : "s"}` : ""}`
    : fallbackDescription;
  const firstRenderableIndex = useMemo(
    () => rankedDeals.findIndex(({ deal }) => getDealSnapshotAmount(deal, kind) != null),
    [kind, rankedDeals],
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
  }, [refreshKey, selectedCategoryKey]);

  return (
    <section className={`flex flex-col gap-3 px-5 py-5 ${isSavings ? "bg-fair-50" : "bg-alert-50"}`} aria-labelledby={`${kind}-snapshot-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${kind}-snapshot-title`} className={`dd-type-section ${isSavings ? "text-fair-800" : "text-alert-700"}`}>
            {title}
          </h2>
          <p className="dd-type-secondary mt-1 max-w-[18rem] text-stone-600" aria-live="polite">{sectionSubtext}</p>
        </div>
        <button
          type="button"
          onClick={isShortRail ? onSeeMore : onSeeAll}
          className={`shrink-0 cursor-pointer dd-type-control underline underline-offset-4 transition-colors ${
            isSavings ? "text-fair-800 hover:text-fair-950" : "text-alert-700 hover:text-alert-950"
          }`}
        >
          {isShortRail ? "See more" : "See all"}
        </button>
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
                dataOnboarding={
                  index === firstRenderableIndex
                    ? isSavings
                      ? "top-savings-deal-card"
                      : "dodgy-deal-card"
                    : undefined
                }
                snapshot={{
                  rank: index + 1,
                  kind,
                  amount,
                  isNew: newTop20Keys.has(getTop20DealKey(product.id, deal.store)),
                }}
              />
            );
          })}
          {!isShortRail && <SnapshotSeeAllCard kind={kind} onSeeAll={onSeeAll} label="See all" />}
        </motion.div>
      )}
      <span className="sr-only" aria-live="polite">
        {isRefreshing ? `${title} updated` : ""}
      </span>
    </section>
  );
}

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
  const beltTitle = isSavings ? "Top Savings Specials" : "Dodgiest Specials";

  return (
    <button
      type="button"
      onClick={onSeeAll}
      aria-label={`${label} ${label === "See all" ? "in" : "from"} ${beltTitle.toLowerCase()}`}
      className={`flex w-[40%] min-w-[136px] max-w-[180px] shrink-0 cursor-pointer snap-start self-stretch rounded-[1.5rem] p-4 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 ${
        isSavings
          ? "text-fair-800 focus-visible:outline-fair-700"
          : "text-alert-700 focus-visible:outline-alert-700"
      }`}
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
