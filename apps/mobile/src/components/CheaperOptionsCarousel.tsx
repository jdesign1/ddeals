"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type CheaperAlternative, type CurrentDeal, type ProductCard as ProductCardData } from "@dodgey-deals/shared";
import ProductImage from "@/components/ProductImage";
import { saveWatchlistReturnContext } from "@/lib/watchlist-navigation";

const MAX_CHEAPER_OPTIONS = 5;

export default function CheaperOptionsCarousel({
  alternatives,
  originalProduct,
  originalDeal,
  originalProductName,
  watchlistProductId,
  loading = false,
  error,
}: {
  alternatives: CheaperAlternative[];
  originalProduct: ProductCardData;
  originalDeal: CurrentDeal;
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
        <CheaperOptionsThumbnailBelt
          key={`${originalProduct.id}-${originalDeal.store}-${visibleAlternatives.map(({ product, store }) => `${product.id}-${store}`).join("|")}`}
          alternatives={visibleAlternatives}
          originalProduct={originalProduct}
          originalDeal={originalDeal}
          watchlistProductId={watchlistProductId}
        />
      )}
    </div>
  );
}

function CheaperOptionsThumbnailBelt({
  alternatives,
  originalProduct,
  originalDeal,
  watchlistProductId,
}: {
  alternatives: CheaperAlternative[];
  originalProduct: ProductCardData;
  originalDeal: CurrentDeal;
  watchlistProductId: string;
}) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const openAlternativeDeal = (alternative: CheaperAlternative) => {
    const scrollSurface = document.querySelector<HTMLElement>(".mobile-scroll-surface");
    saveWatchlistReturnContext(watchlistProductId, scrollSurface?.scrollTop ?? 0);
    router.push(`/deal/${encodeURIComponent(alternative.product.id)}/${encodeURIComponent(alternative.store)}`);
  };

  const thumbnailOptions = [
    { product: originalProduct, store: originalDeal.store, price: originalDeal.price, alternative: null },
    ...alternatives.map((alternative) => ({
      product: alternative.product,
      store: alternative.store,
      price: alternative.price,
      alternative,
    })),
  ];

  return (
    <div className="px-3">
      <div className="mt-1">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-fair-700">Cheaper options</p>
          <span className="text-[11px] font-semibold text-stone-500">Tap to compare</span>
        </div>
        <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Cheaper options">
          {thumbnailOptions.map(({ product, store, price, alternative }, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={[product.id, store].join("-")}
                type="button"
                onClick={() => {
                  setSelectedIndex(index);
                  if (alternative) openAlternativeDeal(alternative);
                }}
                aria-label={`${index === 0 ? "Saved item: " : "Cheaper option: "}${product.name} at ${store}, $${price.toFixed(2)}`}
                aria-pressed={isSelected}
                className={`relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border bg-white p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${isSelected ? "border-2 border-stone-900" : "border-stone-200"}`}
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
