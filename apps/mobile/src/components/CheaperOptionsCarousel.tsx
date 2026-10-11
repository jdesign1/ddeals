"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { findDealForStore, getStoreProductUrl, type CheaperAlternative } from "@dodgey-deals/shared";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import { saveWatchlistReturnContext } from "@/lib/watchlist-navigation";

const MAX_CHEAPER_OPTIONS = 5;

export default function CheaperOptionsCarousel({
  alternatives,
  originalProductName,
  watchlistProductId,
  loading = false,
  error,
}: {
  alternatives: CheaperAlternative[];
  originalProductName: string;
  watchlistProductId: string;
  loading?: boolean;
  error?: string | null;
}) {
  const visibleAlternatives = alternatives.slice(0, MAX_CHEAPER_OPTIONS);

  return (
    <div
      className="mt-2 border-t border-fair-100 bg-fair-50/60 pb-3 pt-3"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {loading ? (
        <p className="rounded-xl bg-white px-3 py-3 text-center text-xs font-semibold text-stone-500">
          Finding cheaper options…
        </p>
      ) : error ? (
        <p className="rounded-xl bg-white px-3 py-3 text-center text-xs font-semibold text-alert-700">
          We couldn&apos;t load cheaper options right now.
        </p>
      ) : visibleAlternatives.length === 0 ? (
        <p className="rounded-xl bg-white px-3 py-3 text-center text-xs font-semibold text-stone-500">
          No cheaper options found for {originalProductName} right now.
        </p>
      ) : (
        <CheaperOptionsContent
          key={visibleAlternatives.map(({ product, store }) => `${product.id}-${store}`).join("|")}
          alternatives={visibleAlternatives}
          watchlistProductId={watchlistProductId}
        />
      )}
    </div>
  );
}

function CheaperOptionsContent({
  alternatives,
  watchlistProductId,
}: {
  alternatives: CheaperAlternative[];
  watchlistProductId: string;
}) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedAlternative = alternatives[selectedIndex] ?? alternatives[0];
  const { product: alternativeProduct, store, price, saving } = selectedAlternative;

  const openAlternativeDeal = () => {
    const scrollSurface = document.querySelector<HTMLElement>(".mobile-scroll-surface");
    saveWatchlistReturnContext(watchlistProductId, scrollSurface?.scrollTop ?? 0);
    router.push(`/deal/${encodeURIComponent(alternativeProduct.id)}/${encodeURIComponent(store)}`);
  };

  return (
    <div className="px-3">
      <div className="dd-deal-assessment-card relative flex min-h-52 flex-col gap-2 rounded-2xl border border-stone-300 bg-white px-3 pb-3 pt-5 shadow-xs">
        <button
          type="button"
          onClick={openAlternativeDeal}
          aria-label={`View deal assessment for ${alternativeProduct.name} at ${store}`}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-2 border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        >
          <div className="flex items-start gap-3">
            <div className="product-image-frame deal-assessment-image flex h-16 w-16 flex-shrink-0 select-none items-center justify-center overflow-hidden rounded-xl">
              <ProductImage
                src={alternativeProduct.image}
                alt={alternativeProduct.name}
                width={64}
                height={64}
                className="product-image-content h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-grow py-0.5">
              <p className="dd-type-meta text-stone-600">
                {alternativeProduct.brand
                  ? alternativeProduct.brand.charAt(0).toUpperCase() + alternativeProduct.brand.slice(1).toLowerCase()
                  : alternativeProduct.brand}{" "}
                {alternativeProduct.unit}
              </p>
              <h3 className="mt-1 line-clamp-2 font-display text-sm font-bold leading-snug text-stone-900">
                {alternativeProduct.name}
              </h3>
              <div className="mt-2 flex items-baseline gap-1 whitespace-nowrap">
                <span className="font-display text-sm font-extrabold text-stone-900">{"$"}{price.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <span className="dd-cheaper-saving-badge block w-full rounded-md border border-fair-800 bg-fair-800 px-2 py-1.5 text-xs font-semibold leading-4 text-white">
            Save <strong className="font-extrabold">{"$"}{saving.toFixed(2)}</strong> compared with saved item
          </span>
        </button>
        <a
          href={findDealForStore(alternativeProduct.currentDeals, store)?.productUrl || getStoreProductUrl(store, alternativeProduct.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-full border border-stone-400 bg-white py-2 text-center text-xs font-bold text-stone-700 transition-all hover:bg-stone-50"
        >
          <span aria-hidden="true">
            <StoreLogoBadge store={store} variant="card" />
          </span>
          Go to {store}
          <ExternalLink className="h-4 w-4 opacity-60" aria-hidden="true" />
        </a>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-fair-700">Cheaper options</p>
        <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Cheaper options">
          {alternatives.map(({ product, store: optionStore, price: optionPrice }, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={[product.id, optionStore].join("-")}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-label={`${product.name} at ${optionStore}, $${optionPrice.toFixed(2)}`}
                aria-pressed={isSelected}
                className={`relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border bg-white p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${isSelected ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200"}`}
              >
                <ProductImage
                  src={product.image}
                  alt=""
                  width={56}
                  height={56}
                  className="product-image-content h-full w-full object-contain"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
