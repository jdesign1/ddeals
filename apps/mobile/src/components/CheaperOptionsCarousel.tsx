"use client";

import { ExternalLink } from "lucide-react";
import { findDealForStore, getStoreProductUrl, type CheaperAlternative } from "@dodgey-deals/shared";
import AddToListButton from "@/components/AddToListButton";
import InsightCarousel from "@/components/InsightCarousel";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";

const MAX_CHEAPER_OPTIONS = 5;

export default function CheaperOptionsCarousel({
  alternatives,
  originalProductName,
  loading = false,
  error,
}: {
  alternatives: CheaperAlternative[];
  originalProductName: string;
  loading?: boolean;
  error?: string | null;
}) {
  const visibleAlternatives = alternatives.slice(0, MAX_CHEAPER_OPTIONS);

  return (
    <div
      className="mt-2 border-t border-stone-100 bg-stone-50/70 pb-3 pt-3"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-stone-500">Cheaper options</p>
        {visibleAlternatives.length > 0 && (
          <span className="text-[11px] font-bold text-stone-500">{visibleAlternatives.length} found</span>
        )}
      </div>

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
        <InsightCarousel slideWidthClassName="w-[88%]">
          {visibleAlternatives.map(({ product: alternativeProduct, store, price, saving }) => (
            <div key={[alternativeProduct.id, store].join("-")}>
              <div className="dd-deal-assessment-card relative flex min-h-52 flex-col gap-2 rounded-2xl border border-stone-300 bg-white px-3 pb-3 pt-5 shadow-xs">
                <AddToListButton productId={alternativeProduct.id} productName={alternativeProduct.name} />
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
                    <p className="dd-type-secondary dd-type-secondary-strong text-ink-600">
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
                  Save <strong className="font-extrabold">{"$"}{saving.toFixed(2)}</strong>
                </span>
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
            </div>
          ))}
        </InsightCarousel>
      )}
    </div>
  );
}
